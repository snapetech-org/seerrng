import { Link } from 'react-router-dom';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';

const serviceTypes = [
  ['radarrServiceId', 'radarr', 'Radarr'],
  ['sonarrServiceId', 'sonarr', 'Sonarr'],
  ['lidarrServiceId', 'lidarr', 'Lidarr'],
  ['readarrServiceId', 'readarr', 'Bookshelf'],
] as const;
type ServiceKey = (typeof serviceTypes)[number][0];

const fields = [
  ['users', 'User IDs'],
  ['genre', 'Genres'],
  ['language', 'Languages'],
  ['keywords', 'Keywords'],
  ['productionCountries', 'Production Countries'],
  ['profileId', 'Quality Profile ID'],
  ['languageProfileId', 'Language Profile ID'],
  ['rootFolder', 'Root Folder'],
  ['tags', 'Tag IDs'],
] as const;

type Rule = { id: number } & Partial<Record<ServiceKey, number | null>> &
  Partial<Record<(typeof fields)[number][0], string | number | null>>;
type Service = { id: number; name: string };

function RulesForService({
  rules,
  service,
}: {
  rules: Rule[];
  service: (typeof serviceTypes)[number];
}) {
  const [key, endpoint, label] = service;
  const services = useApi<Service[]>(`/settings/${endpoint}`);
  return (
    <Section title={label}>
      <ServiceNote
        what={`${label} service names`}
        error={services.error}
        retry={services.reload}
      />
      {rules.map((rule) => {
        const serviceId = rule[key];
        const name = services.data?.find(({ id }) => id === serviceId)?.name;
        return (
          <Section
            key={rule.id}
            title={`${name || `${label} Service ${serviceId}`} · Rule ${rule.id}`}
          >
            <dl className="setlist">
              {fields.map(([field, title]) => {
                const value = rule[field];
                if (value == null || value === '') return null;
                return (
                  <div className="set" key={field}>
                    <dt>
                      <b>{title}</b>
                    </dt>
                    <dd>{value}</dd>
                  </div>
                );
              })}
            </dl>
          </Section>
        );
      })}
    </Section>
  );
}

export default function AdminOverrideRules() {
  const rules = useApi<Rule[]>('/overrideRule');
  return (
    <>
      <header className="ph">
        <h1>Request Override Rules</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          Back to Administration
        </Link>
      </div>
      <ServiceNote
        what="request override rules"
        error={rules.error}
        retry={rules.reload}
      />
      {!rules.data && !rules.error && (
        <p className="note" role="status">
          Loading request override rules…
        </p>
      )}
      {rules.data?.length === 0 && (
        <p className="note">No request override rules configured.</p>
      )}
      {serviceTypes.map((service) => {
        const matches = rules.data?.filter((rule) => rule[service[0]] != null);
        return matches?.length ? (
          <RulesForService key={service[0]} rules={matches} service={service} />
        ) : null;
      })}
    </>
  );
}
