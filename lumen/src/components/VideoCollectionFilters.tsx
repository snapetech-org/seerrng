import { useApi } from '../hooks';

type FilterState = Record<
  'status' | 'year' | 'genre' | 'rating' | 'language',
  string
>;

export const emptyVideoFilters: FilterState = {
  status: '',
  year: '',
  genre: '',
  rating: '',
  language: '',
};

export interface VideoFilterMetadata {
  releaseDate?: string;
  status?: string;
  genreIds?: number[];
  voteAverage?: number;
  originalLanguage?: string;
}

export function matchesVideoFilters(
  part: VideoFilterMetadata,
  filters: FilterState
) {
  const year = part.releaseDate?.slice(0, 4);
  return (
    (!filters.status || part.status === filters.status) &&
    (!filters.year ||
      (filters.year === 'before-1970'
        ? !!year && Number(year) < 1970
        : year === filters.year)) &&
    (!filters.genre || part.genreIds?.includes(Number(filters.genre))) &&
    (!filters.rating || (part.voteAverage ?? 0) >= Number(filters.rating)) &&
    (!filters.language || part.originalLanguage === filters.language)
  );
}

type Option = { value: string; label: string };
const textOption = (value: string): Option => ({ value, label: value });

export default function VideoCollectionFilters({
  kind,
  filters,
  onChange,
  disabled,
}: {
  kind: 'movie' | 'tv';
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  disabled: boolean;
}) {
  const genres = useApi<{ id: number; name: string }[]>(`/genres/${kind}`).data;
  const languages =
    useApi<{ iso_639_1: string; english_name: string }[]>('/languages').data;
  const currentYear = new Date().getFullYear();
  const fields: { key: keyof FilterState; label: string; options: Option[] }[] =
    [
      {
        key: 'year',
        label: 'Release Year',
        options: [
          ...Array.from({ length: currentYear - 1969 }, (_, index) =>
            textOption(String(currentYear - index))
          ),
          { value: 'before-1970', label: 'Before 1970' },
        ],
      },
      {
        key: 'genre',
        label: 'Genre',
        options: (Array.isArray(genres) ? genres : []).map(({ id, name }) => ({
          value: String(id),
          label: name,
        })),
      },
      {
        key: 'rating',
        label: 'Minimum Rating',
        options: Array.from({ length: 10 }, (_, index) => ({
          value: String(index + 1),
          label: `${index + 1}+`,
        })),
      },
      {
        key: 'language',
        label: 'Language',
        options: (Array.isArray(languages) ? languages : [])
          .map(({ iso_639_1, english_name }) => ({
            value: iso_639_1,
            label: english_name,
          }))
          .sort((left, right) => left.label.localeCompare(right.label)),
      },
    ];
  if (kind === 'tv') {
    fields.unshift({
      key: 'status',
      label: 'Series Status',
      options: [
        'Returning Series',
        'Planned',
        'In Production',
        'Ended',
        'Canceled',
        'Pilot',
      ].map(textOption),
    });
  }

  return (
    <div className="toolbar" role="group" aria-label="Collection Filters">
      {fields.map(({ key, label, options }) => (
        <label className="sel" key={key}>
          <span className="lbl">{label}</span>
          <select
            value={filters[key]}
            disabled={disabled || !options.length}
            onChange={(event) =>
              onChange({ ...filters, [key]: event.target.value })
            }
          >
            <option value="">Any</option>
            {options.map(({ value, label: name }) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        className="btn btn-quiet btn-sm"
        type="button"
        disabled={disabled || !Object.values(filters).some(Boolean)}
        onClick={() => onChange(emptyVideoFilters)}
      >
        Clear Filters
      </button>
    </div>
  );
}
