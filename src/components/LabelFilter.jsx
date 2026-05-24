import { getLabelColor } from './useNeo4jData'

export default function LabelFilter({ labels, active, onChange, counts }) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
      {labels.map(label => {
        const isAll = label === 'すべて'
        const isActive = active === label
        const count = isAll
          ? Object.values(counts).reduce((a, b) => a + b, 0)
          : (counts[label] || 0)

        return (
          <button
            key={label}
            onClick={() => onChange(label)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150
              ${isActive
                ? isAll
                  ? 'bg-slate-100 text-slate-900'
                  : getLabelColor(label).replace('bg-', 'bg-').replace('text-', 'text-') + ' shadow-lg'
                : 'bg-slate-800 text-slate-400 active:bg-slate-700'
              }`}
          >
            {!isAll && (
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-current opacity-60' : getLabelColor(label).split(' ')[0]}`} />
            )}
            {label}
            <span className={`text-xs ${isActive ? 'opacity-70' : 'text-slate-500'}`}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
