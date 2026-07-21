import type { MergeableStore } from 'tinybase';
import { useDataLayer } from '../../data/index.ts';
import { usePerson } from '../../data/persons.ts';
import PersonAvatar from './PersonAvatar.tsx';

export interface PersonAvatarsRowProps {
  personIds: readonly string[];
  small?: boolean;
  /**
   * Optional className applied to the wrapper. Callers can use this
   * to position the avatars inside a flex row (the wrapper is itself
   * a flex container with `gap: 4px`).
   */
  className?: string;
}

/**
 * Resolves a list of person ids against the store and renders their
 * avatars. Filters out ids whose person is missing (e.g. just-deleted).
 * Per the spec, the caller is responsible for already passing ids in
 * display order (Self first, then by name).
 */
export default function PersonAvatarsRow({
  personIds,
  small,
  className,
}: PersonAvatarsRowProps): React.JSX.Element | null {
  const { store } = useDataLayer();
  if (personIds.length === 0) return null;
  const classes = ['person-avatars', 'person-avatars-row'];
  if (className) classes.push(className);
  return (
    <span className={classes.join(' ')}>
      {personIds.map((id) => (
        <PersonAvatarForId key={id} id={id} small={small} store={store} />
      ))}
    </span>
  );
}

function PersonAvatarForId({
  id,
  small,
  store,
}: {
  id: string;
  small: boolean | undefined;
  store: MergeableStore;
}): React.JSX.Element | null {
  const person = usePerson(store, id);
  if (!person) return null;
  return <PersonAvatar name={person.name} color={person.color} small={small} />;
}
