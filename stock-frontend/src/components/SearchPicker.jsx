import { useEffect, useRef, useState } from "react";

function SearchPicker({
  title,
  placeholder,
  query,
  onQueryChange,
  options,
  selectedId,
  selectedOption,
  onSelect,
  getLabel = (item) => item.name,
  getMeta = () => "",
  disabled = false,
  emptyMessage = "No matching results."
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const activeOption = selectedOption || options.find((item) => String(item.id) === String(selectedId));

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const handleSelect = (itemId) => {
    onSelect(String(itemId));
    onQueryChange("");
    setIsOpen(false);
  };

  return (
    <div className="search-picker" ref={containerRef}>
      <h3>{title}</h3>
      <button
        type="button"
        className={`picker-trigger${isOpen ? " open" : ""}`}
        onClick={() => !disabled && setIsOpen((value) => !value)}
        disabled={disabled}
      >
        <div className="picker-trigger-copy">
          <strong>{activeOption ? getLabel(activeOption) : placeholder}</strong>
          <small>{activeOption ? getMeta(activeOption) : "Choose from the available list or search below."}</small>
        </div>
        <span className="picker-chevron">{isOpen ? "▴" : "▾"}</span>
      </button>

      <div className={`search-picker-dropdown${isOpen ? " open" : ""}`}>
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          disabled={disabled}
        />
        <div className="search-picker-list">
          {options.length === 0 ? (
            <p className="metric-label">{emptyMessage}</p>
          ) : (
            options.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`picker-option${String(item.id) === String(selectedId) ? " selected" : ""}`}
                onClick={() => handleSelect(item.id)}
              >
                <span>{getLabel(item)}</span>
                {getMeta(item) ? <small>{getMeta(item)}</small> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchPicker;
