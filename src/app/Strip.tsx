// value: one id, or a list for strips where several chips can be on (an empty list lights the none chip).
export function Strip({ items, value, onPick, label }: { items: { id: string; icon: string; img?: string }[]; value: string | string[]; onPick: (id: string) => void; label: string }) {
  const on = (id: string) => (Array.isArray(value) ? (value.length === 0 ? id === 'none' : value.includes(id)) : value === id);
  return (
    <nav class="strip" aria-label={label}>
      {items.map((p) => (
        <button
          key={p.id}
          class={'chip' + (on(p.id) ? ' active' : '')}
          aria-label={p.id}
          aria-pressed={on(p.id)}
          onClick={() => onPick(p.id)}
        >
          {p.img ? <img src={p.img} alt="" decoding="async" loading="lazy" /> : p.icon}
        </button>
      ))}
    </nav>
  );
}
