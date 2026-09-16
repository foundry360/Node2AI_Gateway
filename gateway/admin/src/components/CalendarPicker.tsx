'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAnchoredMenuStyle } from '@/components/useAnchoredMenuStyle';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar day as `YYYY-MM-DD`. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateKey(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(y, mo - 1, day);
  if (
    d.getFullYear() !== y ||
    d.getMonth() !== mo - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildMonthCells(month: Date): Array<Date | null> {
  const first = startOfMonth(month);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function CalendarPicker({
  open,
  value,
  onChange,
  onClose,
  anchorRef,
}: {
  open: boolean;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  /** Optional element that should not count as an outside click (e.g. the trigger). */
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const selected = useMemo(() => (value ? parseDateKey(value) : null), [value]);
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(selected ?? new Date()),
  );
  const emptyAnchor = useRef<HTMLElement | null>(null);
  const positionAnchor = anchorRef ?? emptyAnchor;
  const menuStyle = useAnchoredMenuStyle(open, positionAnchor, rootRef, {
    matchTriggerWidth: false,
    maxWidthPx: 280,
    align: 'end',
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setViewMonth(startOfMonth(selected ?? new Date()));
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !mounted) return null;

  const cells = buildMonthCells(viewMonth);
  const label = `${MONTH_NAMES[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;

  return createPortal(
    <div
      ref={rootRef}
      className="calendar-picker calendar-picker-portal"
      role="dialog"
      aria-label="Choose date"
      style={menuStyle}
    >
      <div className="calendar-picker-header">
        <button
          type="button"
          className="calendar-picker-nav"
          aria-label="Previous month"
          onClick={() =>
            setViewMonth(
              new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
            )
          }
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <div className="calendar-picker-month">{label}</div>
        <button
          type="button"
          className="calendar-picker-nav"
          aria-label="Next month"
          onClick={() =>
            setViewMonth(
              new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
            )
          }
        >
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <div className="calendar-picker-weekdays" aria-hidden>
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="calendar-picker-grid" role="grid" aria-label={label}>
        {cells.map((day, index) => {
          if (!day) {
            return <span key={`empty-${index}`} className="calendar-picker-empty" />;
          }
          const key = toDateKey(day);
          const isSelected = selected ? toDateKey(selected) === key : false;
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              className={[
                'calendar-picker-day',
                isSelected ? 'is-selected' : '',
                isToday ? 'is-today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={key}
              aria-pressed={isSelected}
              onClick={() => {
                onChange(key);
                onClose();
              }}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="calendar-picker-footer">
        <button
          type="button"
          className="calendar-picker-footer-btn"
          onClick={() => {
            onChange(todayKey);
            onClose();
          }}
        >
          Today
        </button>
        <button
          type="button"
          className="calendar-picker-footer-btn"
          disabled={!value}
          onClick={() => {
            onChange('');
            onClose();
          }}
        >
          Clear
        </button>
      </div>
    </div>,
    document.body,
  );
}
