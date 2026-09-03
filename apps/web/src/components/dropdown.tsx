'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  position?: 'left' | 'right';
  className?: string;
}

export function Dropdown({
  trigger,
  items,
  position = 'right',
  className = '',
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    right: 0,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8, // Fixed positioning is relative to viewport, so no need for scrollY
        left: position === 'left' ? rect.left : 0,
        right: position === 'right' ? window.innerWidth - rect.right : 0,
      });
    }
  }, [isOpen, position]);

  // Update position on scroll/resize when open
  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + 8,
          left: position === 'left' ? rect.left : 0,
          right: position === 'right' ? window.innerWidth - rect.right : 0,
        });
      }
    };

    window.addEventListener('scroll', updatePosition, true); // Use capture to catch all scroll events
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, position]);

  const handleItemClick = (item: DropdownItem) => {
    if (!item.disabled) {
      item.onClick();
      setIsOpen(false);
    }
  };

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-48 rounded-md border border-gray-200 bg-white shadow-lg dark:border-[#242424] dark:bg-black"
            style={{
              top: dropdownPosition.top,
              left: position === 'left' ? dropdownPosition.left : undefined,
              right: position === 'right' ? dropdownPosition.right : undefined,
            }}
          >
            <div className="py-1">
              {items.map((item, index) => (
                <button
                  key={index}
                  onClick={() => handleItemClick(item)}
                  disabled={item.disabled}
                  className={`dropdown-normal-weight flex w-full items-center px-4 py-2 text-sm transition-colors focus:outline-none ${
                    item.disabled
                      ? 'cursor-not-allowed text-gray-400'
                      : 'text-gray-800 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-800'
                  } ${item.className || ''}`}
                >
                  {item.icon && (
                    <span className="mr-3 flex-shrink-0">{item.icon}</span>
                  )}
                  <span className="flex-1 text-left">{item.label}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

interface SelectDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  disableScroll?: boolean;
}

export function SelectDropdown({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  className = '',
  disabled = false,
  disableScroll = false,
}: SelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isOpenUpward, setIsOpenUpward] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const dropdownHeight = 240; // max-h-60 = 240px
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Open upward if there's not enough space below but enough space above
      setIsOpenUpward(spaceBelow < dropdownHeight && spaceAbove > spaceBelow);
    }
  }, [isOpen]);

  const selectedOption = options.find(option => option.value === value);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`dropdown-transparent dropdown-normal-weight flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none dark:border-[#242424] dark:text-gray-100 ${
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer hover:border-gray-400 dark:hover:border-gray-500'
        } ${className}`}
      >
        <span
          className={
            selectedOption
              ? 'text-gray-900 dark:text-white'
              : 'text-gray-500 dark:text-white'
          }
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-[#242424] dark:bg-black ${
            isOpenUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          } ${disableScroll ? '' : 'max-h-60 overflow-auto'}`}
        >
          {options.map(option => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              disabled={option.disabled}
              className={`dropdown-normal-weight flex w-full items-center px-3 py-2 text-left text-sm transition-colors focus:outline-none ${
                option.disabled
                  ? 'cursor-not-allowed text-gray-400'
                  : 'text-gray-800 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-800'
              } ${option.value === value ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
