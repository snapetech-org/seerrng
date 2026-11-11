import { Link, useParams } from 'react-router-dom';
import { tmdbImg, type TitleResult } from '../api';
import { Section, TitleCard } from '../components/cards';
import { ExtraCard, ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { Icon } from '../icons';

export function PersonCard({ person }: { person: TitleResult }) {
  return (
    <ExtraCard
      href={`/person/${person.id}`}
      img={person.profilePath ? tmdbImg(person.profilePath) : undefined}
      title={person.name || 'Unknown person'}
      icon="user"
    />
  );
}

interface PersonDetails {
  id: number;
  name: string;
  profilePath?: string;
  biography?: string;
  knownForDepartment?: string;
  placeOfBirth?: string;
}

type PersonCredit = Omit<TitleResult, 'mediaType'> & {
  mediaType?: string;
};

interface PersonCredits {
  cast: PersonCredit[];
  crew: PersonCredit[];
}

export default function PersonDetail() {
  const { id: rawId } = useParams();
  const id = Number(rawId);
  const path =
    Number.isInteger(id) && id > 0 && id <= 1_000_000_000
      ? `/person/${id}`
      : null;
  const person = useApi<PersonDetails>(path);
  const credits = useApi<PersonCredits>(
    path ? `${path}/combined_credits` : null
  );

  const titles: TitleResult[] = [];
  const seen = new Set<string>();
  for (const credit of [
    ...(credits.data?.cast || []),
    ...(credits.data?.crew || []),
  ]) {
    if (credit.mediaType !== 'movie' && credit.mediaType !== 'tv') continue;
    if (!Number.isSafeInteger(credit.id) || credit.id <= 0) continue;
    const key = `${credit.mediaType}:${credit.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push({ ...credit, mediaType: credit.mediaType });
    if (titles.length === 24) break;
  }

  if (!path) return <div className="empty">Person not found.</div>;

  return (
    <>
      <header className="ph">
        <div className="eyebrow">
          <Link to="/search">People</Link>
        </div>
        <h1>{person.data?.name || 'Person'}</h1>
      </header>
      <ServiceNote
        error={person.error}
        what="person details"
        retry={person.reload}
      />
      {!person.data && !person.error && (
        <p className="note">Loading person…</p>
      )}
      {person.data && (
        <div className="person-overview">
          <div className="portrait">
            {person.data.profilePath ? (
              <img
                src={tmdbImg(person.data.profilePath)}
                alt=""
                loading="lazy"
              />
            ) : (
              <span className="art-ph">
                <Icon name="user" />
              </span>
            )}
          </div>
          <div>
            {person.data.knownForDepartment && (
              <p className="sub">{person.data.knownForDepartment}</p>
            )}
            {person.data.placeOfBirth && (
              <p className="sub">Born in {person.data.placeOfBirth}</p>
            )}
            {person.data.biography && (
              <p className="person-bio">{person.data.biography}</p>
            )}
          </div>
        </div>
      )}
      <ServiceNote error={credits.error} what="credits" retry={credits.reload} />
      {!credits.data && !credits.error && (
        <p className="note">Loading credits…</p>
      )}
      {!!titles.length && (
        <Section title="Known for">
          <div className="grid">
            {titles.map((title) => (
              <TitleCard key={`${title.mediaType}:${title.id}`} it={title} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
