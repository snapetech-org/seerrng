import Button from '@app/components/Common/Button';
import discoveryMessages from '@app/components/DiscoveryIntegrations/messages';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import useSWR from 'swr';
import { providerNames, type ProviderConfiguration } from './Configuration';

type Provider = 'trakt' | 'anilist' | 'simkl';
type Account = { provider: Provider; username: string; allowWrites: boolean };
type Pending = {
  provider: Provider;
  userCode?: string;
  verificationUrl: string;
  interval?: number;
  expiresAt: number;
};
const base = '/api/v1/integrations/discovery';
export default function DiscoveryAccounts() {
  const router = useRouter();
  const { data: config } = useSWR<ProviderConfiguration>(
    `${base}/configuration`
  );
  const { data, error, mutate } = useSWR<{ accounts: Account[] }>(
    `${base}/accounts`
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(false);
  const traktCallbackHandled = useRef(false);
  const finish = useCallback(
    async (provider: Provider, authorizationCode?: string) => {
      const response = await axios.post(
        `${base}/accounts/${provider}/complete`,
        authorizationCode ? { code: authorizationCode } : {}
      );
      if (response.data.status === 'authorized') {
        setPending(null);
        setCode('');
        await mutate();
      } else if (!['pending', 'slow_down'].includes(response.data.status)) {
        setPending(null);
        setExpired(true);
      }
      return response.data.interval as number | undefined;
    },
    [mutate]
  );
  useEffect(() => {
    if (!pending || pending.provider === 'anilist') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.now() >= pending.expiresAt) {
        setPending(null);
        setExpired(true);
        return;
      }
      try {
        const interval = await finish(pending.provider);
        if (active)
          timer = setTimeout(
            () => void poll(),
            Math.max(5, interval ?? pending.interval ?? 5) * 1000
          );
      } catch {
        if (active) {
          setFailed(true);
          setPending(null);
        }
      }
    };
    timer = setTimeout(
      () => void poll(),
      Math.max(5, pending.interval ?? 5) * 1000
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // The authorization attempt owns its polling loop; account revalidation does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);
  const act = useCallback(async (callback: () => Promise<unknown>) => {
    setBusy(true);
    setFailed(false);
    setExpired(false);
    try {
      await callback();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!router.isReady || traktCallbackHandled.current) return;
    const completed = router.query.traktComplete === '1';
    const callbackFailed = typeof router.query.traktError === 'string';
    if (!completed && !callbackFailed) return;

    traktCallbackHandled.current = true;
    const query = { ...router.query };
    delete query.traktComplete;
    delete query.traktError;
    void router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
    if (callbackFailed) {
      setFailed(true);
      return;
    }
    void act(() => finish('trakt'));
  }, [router, act, finish]);
  return (
    <section className="mt-8" aria-labelledby="discovery-accounts-title">
      <h3 className="heading" id="discovery-accounts-title">
        <FormattedMessage {...discoveryMessages['accounts.title']} />
      </h3>
      <p className="description mb-4">
        <FormattedMessage {...discoveryMessages['accounts.description']} />
      </p>
      {(failed || error) && (
        <p role="alert" className="mb-4 text-red-400">
          <FormattedMessage {...discoveryMessages['accounts.failed']} />
        </p>
      )}
      {expired && (
        <p role="status" className="mb-4 text-yellow-400">
          <FormattedMessage {...discoveryMessages['accounts.expired']} />
        </p>
      )}
      <div className="space-y-3">
        {(['trakt', 'anilist', 'simkl'] as const).map((provider) => {
          const account = data?.accounts.find(
            (account) => account.provider === provider
          );
          return (
            <div
              key={provider}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-700 p-4"
            >
              <div>
                <h4 className="font-semibold">{providerNames[provider]}</h4>
                <p className="text-sm text-gray-400">
                  {account ? (
                    account.username
                  ) : config?.[provider].configured ? (
                    <FormattedMessage
                      {...discoveryMessages['accounts.disconnected']}
                    />
                  ) : (
                    <FormattedMessage
                      {...discoveryMessages['accounts.unconfigured']}
                    />
                  )}
                </p>
                {account && (
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={account.allowWrites}
                      disabled={busy}
                      onChange={(event) => {
                        const allowWrites = event.target.checked;
                        void act(async () => {
                          await axios.put(
                            `${base}/accounts/${provider}/preferences`,
                            { allowWrites }
                          );
                          await mutate();
                        });
                      }}
                    />
                    <span>
                      <FormattedMessage
                        {...discoveryMessages['accounts.allowwrites']}
                        values={{ provider: providerNames[provider] }}
                      />
                      <span className="mt-1 block text-xs text-gray-400">
                        <FormattedMessage
                          {...discoveryMessages['accounts.writesdescription']}
                        />
                      </span>
                    </span>
                  </label>
                )}
              </div>
              {account ? (
                <Button
                  buttonType="danger"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await axios.delete(`${base}/accounts/${provider}`);
                      await mutate();
                    })
                  }
                >
                  <FormattedMessage
                    {...discoveryMessages['accounts.disconnect']}
                  />
                </Button>
              ) : (
                <Button
                  disabled={busy || !!pending || !config?.[provider].configured}
                  onClick={() =>
                    void act(async () => {
                      const response = await axios.post(
                        `${base}/accounts/${provider}/connect`
                      );
                      if (provider === 'trakt' && response.data.authorizeUrl) {
                        window.location.href = response.data.authorizeUrl;
                        return;
                      }
                      setPending({
                        provider,
                        ...response.data,
                        expiresAt:
                          Date.now() + (response.data.expiresIn ?? 600) * 1000,
                      });
                    })
                  }
                >
                  <FormattedMessage
                    {...discoveryMessages['accounts.connect']}
                  />
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {pending && (
        <div
          className="mt-4 rounded-lg border border-blue-500 p-4"
          role="status"
        >
          <p>
            <FormattedMessage
              {...discoveryMessages['accounts.authorize']}
              values={{ provider: providerNames[pending.provider] }}
            />
          </p>
          {pending.userCode && (
            <p className="my-3 font-mono text-xl">{pending.userCode}</p>
          )}
          <Button
            as="a"
            href={pending.verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="my-3"
          >
            <FormattedMessage {...discoveryMessages['accounts.open']} />
          </Button>
          {pending.provider === 'anilist' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void act(() => finish('anilist', code));
              }}
            >
              <label htmlFor="anilist-code">
                <FormattedMessage {...discoveryMessages['accounts.code']} />
              </label>
              <input
                id="anilist-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                maxLength={4096}
                autoComplete="off"
                className="my-2 block w-full"
              />
              <Button type="submit" disabled={busy || !code.trim()}>
                <FormattedMessage {...discoveryMessages['accounts.complete']} />
              </Button>
            </form>
          )}
          <Button
            className="ms-3"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                if (pending.provider !== 'anilist')
                  await axios.delete(`${base}/accounts/${pending.provider}`);
                setPending(null);
                setCode('');
              })
            }
          >
            <FormattedMessage {...discoveryMessages['accounts.cancel']} />
          </Button>
        </div>
      )}
    </section>
  );
}
