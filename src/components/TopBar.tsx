export interface TopBarProps {
  onMenu?: () => void;
}

export default function TopBar({ onMenu }: TopBarProps): React.JSX.Element {
  return (
    <header className="main-header">
      <button
        type="button"
        className="menu-toggle"
        aria-label="Open sidebar"
        onClick={onMenu}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#menu-icon" />
        </svg>
      </button>
      <span className="main-header-spacer" />
    </header>
  );
}
