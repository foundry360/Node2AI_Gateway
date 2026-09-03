'use client';

import { useState, useRef, useEffect } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { createPortal } from 'react-dom';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  className?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  className = '',
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectingStart, setSelectingStart] = useState(true);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
      });
    }
  }, [isOpen]);

  const startDateObj = startDate ? new Date(startDate) : null;
  const endDateObj = endDate ? new Date(endDate) : null;

  const handleDateClick = (date: Date) => {
    if (selectingStart || !startDateObj || date < startDateObj) {
      onStartDateChange(format(date, 'yyyy-MM-dd'));
      onEndDateChange('');
      setSelectingStart(false);
    } else {
      onEndDateChange(format(date, 'yyyy-MM-dd'));
      setSelectingStart(true);
      setIsOpen(false);
    }
  };

  const renderCalendar = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const monthKey = format(month, 'MMMM yyyy');

    return (
      <div key={monthKey} className="w-72">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ChevronLeftIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </button>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {format(month, 'MMMM yyyy')}
          </h3>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ChevronRightIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
            <div
              key={day}
              className="p-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400"
            >
              {day}
            </div>
          ))}
          {days.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, month);
            const isStartDate = startDateObj && isSameDay(day, startDateObj);
            const isEndDate = endDateObj && isSameDay(day, endDateObj);
            const isInRange =
              startDateObj &&
              endDateObj &&
              day >= startDateObj &&
              day <= endDateObj;
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={idx}
                onClick={() => handleDateClick(day)}
                disabled={!isCurrentMonth}
                className={`
                  h-8 w-8 rounded text-sm transition-colors
                  ${
                    !isCurrentMonth
                      ? 'text-gray-300 dark:text-gray-600'
                      : 'text-gray-900 dark:text-gray-100'
                  }
                  ${
                    isStartDate || isEndDate
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : isInRange
                        ? 'bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-100'
                        : isToday
                          ? 'bg-gray-100 dark:bg-gray-800'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }
                `}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const nextMonth = addMonths(currentMonth, 1);

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-[#242424] dark:text-gray-400"
      >
        <CalendarIcon className="h-4 w-4" />
        <span>
          {startDate && endDate
            ? `${format(new Date(startDate), 'MMM d')} - ${format(new Date(endDate), 'MMM d')}`
            : startDate
              ? `${format(new Date(startDate), 'MMM d')} - ...`
              : 'Select date range'}
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={pickerRef}
            className="fixed z-50 rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-[#242424] dark:bg-[#0d1117]"
            style={{
              top: position.top,
              left: position.left,
            }}
          >
            <div className="flex gap-8">
              {renderCalendar(currentMonth)}
              {renderCalendar(nextMonth)}
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-[#242424]">
              <button
                onClick={() => {
                  onStartDateChange('');
                  onEndDateChange('');
                  setSelectingStart(true);
                }}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Clear
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
