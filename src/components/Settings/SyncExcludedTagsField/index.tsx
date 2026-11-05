import type { Tag } from '@server/api/servarr/base';
import Select from 'react-select';

type TagOption = {
  value: number;
  label: string;
};

interface SyncExcludedTagsFieldProps {
  id: string;
  label: string;
  helpText: string;
  selectedTagIds: number[];
  tags: Tag[];
  isValidated: boolean;
  isTesting: boolean;
  placeholder: string;
  noOptionsText: string;
  onChange: (tagIds: number[]) => void;
}

const SyncExcludedTagsField = ({
  id,
  label,
  helpText,
  selectedTagIds,
  tags,
  isValidated,
  isTesting,
  placeholder,
  noOptionsText,
  onChange,
}: SyncExcludedTagsFieldProps) => {
  const options = tags.map((tag) => ({ value: tag.id, label: tag.label }));
  const optionsById = new Map(options.map((option) => [option.value, option]));
  const selectedOptions = selectedTagIds
    .map((tagId) => optionsById.get(tagId))
    .filter((option): option is TagOption => option !== undefined);

  return (
    <div className="form-row">
      <label htmlFor={id} className="text-label">
        {label}
      </label>
      <div className="form-input-area">
        <Select<TagOption, true>
          inputId={id}
          name={id}
          options={isValidated ? options : []}
          isMulti
          isDisabled={!isValidated || isTesting}
          placeholder={placeholder}
          className="react-select-container"
          classNamePrefix="react-select"
          aria-describedby={`${id}Help`}
          value={selectedOptions}
          onChange={(value) => onChange(value.map((option) => option.value))}
          noOptionsMessage={() => noOptionsText}
        />
      </div>
      <span id={`${id}Help`} className="settings-form-row-description">
        {helpText}
      </span>
    </div>
  );
};

export default SyncExcludedTagsField;
