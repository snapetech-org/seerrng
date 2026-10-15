import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import type { TlsStatusResponse } from '@server/interfaces/api/settingsInterfaces';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import { isBrowserTransportReady } from './Setup/transportReadiness';

const messages = defineMessages('components.TransportSecurityNotice', {
  httpsRequiredTitle: 'HTTPS is required for browser sign-in',
  httpsRequiredDescription:
    'This page is reachable over HTTP, but direct HTTP sign-in is disabled. Use an HTTPS reverse proxy, enable built-in TLS, or enable authenticated HTTP sessions on a trusted LAN before signing in.',
  proxyHttpsTitle: 'HTTPS is active through your reverse proxy',
  proxyHttpsDescription:
    'This browser connection is encrypted, so you can continue setup. The built-in HTTPS listener remains disabled because your reverse proxy provides transport security.',
  insecureTitle: 'Insecure HTTP sign-in is enabled',
  insecureDescription:
    'Direct HTTP browser sign-in is enabled while built-in TLS is disabled. Anyone who can observe this network traffic could steal a session cookie. Use this only on a trusted LAN and prefer HTTPS whenever possible.',
  selfSignedTitle: 'Trust the SeerrNG local CA before signing in',
  selfSignedDescription:
    'Built-in HTTPS is active with a locally generated certificate. Download and install the local CA on each trusted device, then open the HTTPS URL again.',
  providedTitle: 'HTTPS is enabled',
  providedDescription:
    'SeerrNG is using the certificate supplied by the operator. Verify the fingerprint below if your browser or reverse proxy reports a certificate mismatch.',
  httpsUrl: 'HTTPS URL: {url}',
  fingerprint: 'SHA-256 fingerprint: {fingerprint}',
  downloadCa: 'Download the SeerrNG local CA certificate',
  configuredHosts: 'Configured TLS hosts: {hosts}',
  firstRunTitle: 'Choose browser transport before the first login',
  firstRunDescription:
    'HTTPS is recommended for new installations. Direct HTTP sign-in is enabled by default when built-in HTTPS is disabled, but carries a session interception risk. Choose self-signed HTTPS, provide a certificate, or acknowledge that risk before saving the HTTP option. The server must be restarted before the choice becomes active.',
  tlsMode: 'HTTPS mode',
  modeDisabled: 'Leave HTTPS disabled',
  modeSelfSigned: 'Generate a local self-signed certificate',
  modeProvided: 'Use a provided certificate',
  httpsPort: 'HTTPS port',
  tlsHosts: 'Certificate hostnames and IP addresses',
  certificateFile: 'Certificate file',
  keyFile: 'Private key file',
  caFile: 'CA chain file (optional)',
  redirectHttp: 'Redirect HTTP to HTTPS after verification',
  allowHttp: 'Allow authenticated sessions over HTTP',
  acknowledgeHttp:
    'I understand that anyone observing this network traffic could steal a session cookie.',
  saveTransport: 'Save transport choice',
  savingTransport: 'Saving…',
  transportSaved:
    'Transport choice saved. Restart SeerrNG, then open the displayed HTTPS address or continue over HTTP when direct HTTP sign-in is enabled.',
  restartRequiredTitle: 'Restart SeerrNG before signing in',
  restartRequiredDescription:
    'The browser transport choice was saved but is not active yet. Restart SeerrNG and reload this page before signing in or configuring a media server.',
  transportSaveFailed: 'The transport choice could not be saved.',
  environmentManaged:
    'Transport is controlled by environment variables ({variables}). Change those variables instead of using this setup control.',
});

type SetupTlsMode = 'disabled' | 'self-signed' | 'provided';

interface TransportSecurityNoticeProps {
  onReadinessChange?: (ready: boolean) => void;
}

const formatHost = (host: string): string =>
  host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

const TransportSecurityNotice = ({
  onReadinessChange,
}: TransportSecurityNoticeProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { data } = useSWR<TlsStatusResponse>('/api/v1/status/tls', {
    revalidateOnFocus: false,
    refreshInterval: 0,
  });
  const [browserUsesHttps, setBrowserUsesHttps] = useState(false);
  const [setupMode, setSetupMode] = useState<SetupTlsMode>('disabled');
  const [setupHttpsPort, setSetupHttpsPort] = useState('5056');
  const [setupHosts, setSetupHosts] = useState('localhost,127.0.0.1,::1');
  const [setupCertificateFile, setSetupCertificateFile] = useState('');
  const [setupKeyFile, setSetupKeyFile] = useState('');
  const [setupCaFile, setSetupCaFile] = useState('');
  const [setupRedirectHttp, setSetupRedirectHttp] = useState(false);
  const [setupAllowHttp, setSetupAllowHttp] = useState(true);
  const [setupAcknowledgeHttp, setSetupAcknowledgeHttp] = useState(false);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupSaved, setSetupSaved] = useState(false);

  useEffect(() => {
    setBrowserUsesHttps(window.location.protocol === 'https:');
  }, []);

  useEffect(() => {
    if (!data) return;
    setSetupMode(data.configuredMode);
    setSetupHttpsPort(String(data.configuredHttpsPort ?? 5056));
    if (data.hosts.length > 0) {
      setSetupHosts(data.hosts.join(','));
    }
    setSetupRedirectHttp(data.configuredRedirectsHttpToHttps);
    setSetupAllowHttp(data.configuredHttpAuthAllowed);
    setSetupAcknowledgeHttp(data.configuredHttpAuthAllowed);
  }, [data]);

  const transportReady = data
    ? isBrowserTransportReady(data, browserUsesHttps)
    : false;

  useEffect(() => {
    onReadinessChange?.(transportReady);
  }, [onReadinessChange, transportReady]);

  if (!data) {
    return null;
  }

  const setupControls =
    data.setupRequired && data.environmentOverrides.length === 0 ? (
      <div className="mt-4 rounded border border-gray-500 p-4 text-start">
        <h4 className="mb-2 font-semibold">
          {intl.formatMessage(messages.firstRunTitle)}
        </h4>
        <p className="mb-4 text-sm">
          {intl.formatMessage(messages.firstRunDescription)}
        </p>
        <form
          className="space-y-3 text-sm"
          onSubmit={async (event) => {
            event.preventDefault();
            if (setupAllowHttp && !setupAcknowledgeHttp) {
              addToast(intl.formatMessage(messages.acknowledgeHttp), {
                autoDismiss: true,
                appearance: 'error',
              });
              return;
            }
            setSetupSaving(true);
            setSetupSaved(false);
            try {
              await axios.post('/api/v1/status/tls/bootstrap', {
                mode: setupMode,
                httpsPort: Number(setupHttpsPort),
                hosts: setupHosts,
                certificateFile: setupCertificateFile,
                keyFile: setupKeyFile,
                caFile: setupCaFile,
                redirectHttpToHttps: setupRedirectHttp,
                allowHttpAuth: setupAllowHttp,
                httpAuthAcknowledged: setupAcknowledgeHttp,
              });
              setSetupSaved(true);
            } catch {
              addToast(intl.formatMessage(messages.transportSaveFailed), {
                autoDismiss: true,
                appearance: 'error',
              });
            } finally {
              setSetupSaving(false);
            }
          }}
        >
          <label className="flex flex-col gap-1">
            <span>{intl.formatMessage(messages.tlsMode)}</span>
            <select
              value={setupMode}
              onChange={(event) => {
                const nextMode = event.target.value as SetupTlsMode;
                setSetupMode(nextMode);
                if (nextMode !== 'disabled') {
                  setSetupAllowHttp(false);
                  setSetupAcknowledgeHttp(false);
                }
              }}
            >
              <option value="disabled">
                {intl.formatMessage(messages.modeDisabled)}
              </option>
              <option value="self-signed">
                {intl.formatMessage(messages.modeSelfSigned)}
              </option>
              <option value="provided">
                {intl.formatMessage(messages.modeProvided)}
              </option>
            </select>
          </label>
          {setupMode !== 'disabled' && (
            <>
              <label className="flex flex-col gap-1">
                <span>{intl.formatMessage(messages.httpsPort)}</span>
                <input
                  type="number"
                  dir="ltr"
                  min="1"
                  max="65535"
                  value={setupHttpsPort}
                  onChange={(event) => setSetupHttpsPort(event.target.value)}
                />
              </label>
              {setupMode === 'self-signed' && (
                <label className="flex flex-col gap-1">
                  <span>{intl.formatMessage(messages.tlsHosts)}</span>
                  <input
                    type="text"
                    dir="ltr"
                    value={setupHosts}
                    onChange={(event) => setSetupHosts(event.target.value)}
                  />
                </label>
              )}
              {setupMode === 'provided' && (
                <>
                  <label className="flex flex-col gap-1">
                    <span>{intl.formatMessage(messages.certificateFile)}</span>
                    <input
                      type="text"
                      dir="ltr"
                      value={setupCertificateFile}
                      onChange={(event) =>
                        setSetupCertificateFile(event.target.value)
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>{intl.formatMessage(messages.keyFile)}</span>
                    <input
                      type="text"
                      dir="ltr"
                      value={setupKeyFile}
                      onChange={(event) => setSetupKeyFile(event.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>{intl.formatMessage(messages.caFile)}</span>
                    <input
                      type="text"
                      dir="ltr"
                      value={setupCaFile}
                      onChange={(event) => setSetupCaFile(event.target.value)}
                    />
                  </label>
                </>
              )}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={setupRedirectHttp}
                  onChange={(event) =>
                    setSetupRedirectHttp(event.target.checked)
                  }
                />
                {intl.formatMessage(messages.redirectHttp)}
              </label>
            </>
          )}
          {setupMode === 'disabled' && (
            <>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={setupAllowHttp}
                  onChange={(event) => {
                    setSetupAllowHttp(event.target.checked);
                    if (!event.target.checked) setSetupAcknowledgeHttp(false);
                  }}
                />
                {intl.formatMessage(messages.allowHttp)}
              </label>
              {setupAllowHttp && (
                <label className="flex items-center gap-2 text-yellow-200">
                  <input
                    type="checkbox"
                    checked={setupAcknowledgeHttp}
                    onChange={(event) =>
                      setSetupAcknowledgeHttp(event.target.checked)
                    }
                  />
                  {intl.formatMessage(messages.acknowledgeHttp)}
                </label>
              )}
            </>
          )}
          <Button buttonType="primary" type="submit" disabled={setupSaving}>
            {setupSaving
              ? intl.formatMessage(messages.savingTransport)
              : intl.formatMessage(messages.saveTransport)}
          </Button>
          {setupSaved && (
            <p className="text-green-300">
              {intl.formatMessage(messages.transportSaved)}
            </p>
          )}
        </form>
      </div>
    ) : data.setupRequired && data.environmentOverrides.length > 0 ? (
      <p className="mt-3 text-sm">
        {intl.formatMessage(messages.environmentManaged, {
          variables: data.environmentOverrides.join(', '),
        })}
      </p>
    ) : null;

  const httpsUrls =
    data.httpsPort === null
      ? []
      : data.hosts.map(
          (host) => `https://${formatHost(host)}:${data.httpsPort}`
        );

  if (data.pendingRestart && !browserUsesHttps) {
    return (
      <Alert
        type="warning"
        title={intl.formatMessage(messages.restartRequiredTitle)}
      >
        {intl.formatMessage(messages.restartRequiredDescription)}
        {setupControls}
      </Alert>
    );
  }

  if (data.mode === 'disabled' && !data.httpAuthAllowed && browserUsesHttps) {
    return (
      <Alert type="info" title={intl.formatMessage(messages.proxyHttpsTitle)}>
        {intl.formatMessage(messages.proxyHttpsDescription)}
        {setupControls}
      </Alert>
    );
  }

  if (data.mode === 'disabled' && !data.httpAuthAllowed) {
    return (
      <>
        <Alert
          type="info"
          title={intl.formatMessage(messages.httpsRequiredTitle)}
        >
          {intl.formatMessage(messages.httpsRequiredDescription)}
          {setupControls}
        </Alert>
      </>
    );
  }

  if (data.mode === 'disabled' && data.httpAuthAllowed) {
    return (
      <Alert type="warning" title={intl.formatMessage(messages.insecureTitle)}>
        {intl.formatMessage(messages.insecureDescription)}
        {setupControls}
      </Alert>
    );
  }

  return (
    <Alert
      type={data.mode === 'self-signed' ? 'warning' : 'info'}
      title={intl.formatMessage(
        data.mode === 'self-signed'
          ? messages.selfSignedTitle
          : messages.providedTitle
      )}
    >
      <p>
        {intl.formatMessage(
          data.mode === 'self-signed'
            ? messages.selfSignedDescription
            : messages.providedDescription
        )}
      </p>
      {httpsUrls.length > 0 && (
        <p>
          {intl.formatMessage(messages.httpsUrl, {
            url: httpsUrls.join(', '),
          })}
        </p>
      )}
      {data.hosts.length > 0 && (
        <p>
          {intl.formatMessage(messages.configuredHosts, {
            hosts: data.hosts.join(', '),
          })}
        </p>
      )}
      {data.fingerprint && (
        <p className="break-all">
          {intl.formatMessage(messages.fingerprint, {
            fingerprint: data.fingerprint,
          })}
        </p>
      )}
      {data.caDownloadAvailable && (
        <p>
          <a
            className="font-medium underline"
            href="/api/v1/status/tls/ca"
            download="seerrng-local-ca.crt"
          >
            {intl.formatMessage(messages.downloadCa)}
          </a>
        </p>
      )}
      {setupControls}
    </Alert>
  );
};

export default TransportSecurityNotice;
