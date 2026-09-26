export function Strip({ items, value, onPick, label }: { items: { id: string; icon: string; img?: string }[]; value: string; onPick: (id: string) => void; label: string }) {
  return (
    <nav class="strip" aria-label={label}>
      {items.map((p) => (
        <button
          key={p.id}
          class={'chip' + (value === p.id ? ' active' : '')}
          aria-label={p.id}
          aria-pressed={value === p.id}
          onClick={() => onPick(p.id)}
        >
          {p.img ? <img src={p.img} alt="" decoding="async" /> : p.icon}
        </button>
      ))}
    </nav>
  );
}
