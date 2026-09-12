import { passwordRules } from '@shared';

/** Ticks derive from the shared rules, so they cannot drift from the server. */
export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="mt-1 flex flex-col gap-1" aria-label="Requirements">
      {passwordRules.map((rule) => {
        const met = rule.test(value);

        return (
          <li
            key={rule.id}
            className={`flex items-center gap-2 text-xs ${met ? 'text-emerald-700' : 'text-slate-500'}`}
          >
            <span aria-hidden="true">{met ? '✓' : '○'}</span>
            {rule.label}
            <span className="sr-only">{met ? '— met' : '— not met'}</span>
          </li>
        );
      })}
    </ul>
  );
}
