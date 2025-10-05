import React, { useState, useRef, useEffect } from 'react';
import { format, getDaysInMonth, startOfMonth, getDay, addMonths, subMonths, setHours, setMinutes, isSameDay } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from '@heroicons/react/24/outline';

interface DatePickerProps {
  selected: Date | null;
  onChange: (date: Date | null) => void;
  showTimeSelect?: boolean;
}

const DatePicker: React.FC<DatePickerProps> = ({ selected, onChange, showTimeSelect = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(selected || new Date());
  const pickerRef = useRef<HTMLDivElement>(null);

  const daysOfWeek = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDateChange = (day: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day, selected?.getHours() || 0, selected?.getMinutes() || 0);
    onChange(newDate);
    if (!showTimeSelect) {
      setIsOpen(false);
    }
  };
  
  const handleTimeChange = (type: 'hours' | 'minutes', value: number) => {
      let newDate = selected ? new Date(selected) : new Date();
      if (type === 'hours') {
          newDate = setHours(newDate, value);
      } else {
          newDate = setMinutes(newDate, value);
      }
      onChange(newDate);
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(viewDate);
    const daysInMonth = getDaysInMonth(viewDate);
    const startDayOfWeek = (getDay(monthStart) + 6) % 7; // Monday is 0

    const blanks = Array.from({ length: startDayOfWeek }, (_, i) => <div key={`blank-${i}`} className="text-center p-1"></div>);
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const isSelected = selected && isSameDay(selected, new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
      const isToday = isSameDay(new Date(), new Date(viewDate.getFullYear(), viewDate.getMonth(), day));

      return (
        <div key={day} className="text-center p-1">
          <button
            onClick={() => handleDateChange(day)}
            className={`w-8 h-8 rounded-full text-sm transition-colors ${
              isSelected ? 'bg-primary-600 text-white font-bold' : isToday ? 'bg-primary-100 dark:bg-primary-500/20' : 'hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {day}
          </button>
        </div>
      );
    });

    return (
      <div className="grid grid-cols-7 gap-1">
        {daysOfWeek.map(day => <div key={day} className="text-center font-semibold text-xs text-gray-500">{day}</div>)}
        {blanks}
        {days}
      </div>
    );
  };
  
  const TimeScroller: React.FC<{type: 'hours' | 'minutes'}> = ({ type }) => {
    const values = type === 'hours' ? Array.from({ length: 24 }, (_, i) => i) : Array.from({ length: 60 }, (_, i) => i);
    const selectedValue = selected ? (type === 'hours' ? selected.getHours() : selected.getMinutes()) : 0;
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ref.current) {
            const selectedElement = ref.current.querySelector<HTMLButtonElement>(`[data-value="${selectedValue}"]`);
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'center' });
            }
        }
    }, [selectedValue]);

    return (
      <div ref={ref} className="h-48 overflow-y-scroll border-l dark:border-gray-600 no-scrollbar">
        {values.map(value => {
            const isSelected = value === selectedValue;
            return (
                <button
                    key={value}
                    data-value={value}
                    onClick={() => handleTimeChange(type, value)}
                    className={`block w-full text-center px-4 py-1 text-sm ${isSelected ? 'bg-primary-500 text-white font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                    {value.toString().padStart(2, '0')}
                </button>
            )
        })}
      </div>
    );
  };

  const dateFormat = showTimeSelect ? 'dd.MM.yyyy HH:mm' : 'dd.MM.yyyy';

  return (
    <div className="relative" ref={pickerRef}>
      <div className="relative">
        <input
            type="text"
            readOnly
            value={selected ? format(selected, dateFormat) : ''}
            onClick={() => setIsOpen(!isOpen)}
            className="w-full p-2 pl-10 border rounded-md dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
            placeholder={dateFormat}
        />
        <CalendarIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
      </div>
      {isOpen && (
        <div className="absolute top-full mt-2 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700">
          <div className="flex">
            <div className="p-2">
                <div className="flex items-center justify-between mb-2">
                    <button type="button" onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeftIcon className="w-5 h-5"/></button>
                    <span className="font-semibold text-sm">{format(viewDate, 'MMMM yyyy')}</span>
                    <button type="button" onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRightIcon className="w-5 h-5"/></button>
                </div>
                {renderCalendar()}
            </div>
            {showTimeSelect && (
                <div className="flex">
                    <TimeScroller type="hours" />
                    <TimeScroller type="minutes" />
                </div>
            )}
          </div>
          <div className="flex justify-between p-2 border-t dark:border-gray-600">
              <button type="button" onClick={() => onChange(new Date())} className="px-3 py-1 text-sm text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">Today</button>
              <button type="button" onClick={() => setIsOpen(false)} className="px-3 py-1 text-sm bg-primary-600 text-white rounded-md">Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
