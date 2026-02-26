import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

const TAG_OPTIONS = {
  services_offered: [
    'babysitting',
    'nanny_care',
    'overnight_care',
    'school_pickup',
    'homework_help',
    'special_needs_care'
  ],
  age_groups: [
    'newborn_0_1',
    'toddler_1_3',
    'preschool_3_5',
    'school_age_5_12',
    'teenager_13_17'
  ]
};

const TAG_LABELS = {
  babysitting: 'Babysitting',
  nanny_care: 'Nanny Care',
  overnight_care: 'Overnight Care',
  school_pickup: 'School Pickup',
  homework_help: 'Homework Help',
  special_needs_care: 'Special Needs Care',
  newborn_0_1: 'Newborn (0-1)',
  toddler_1_3: 'Toddler (1-3)',
  preschool_3_5: 'Preschool (3-5)',
  school_age_5_12: 'School Age (5-12)',
  teenager_13_17: 'Teenager (13-17)'
};

export default function TagInput({ fieldType, value = '', onChange, onBlur, disabled = false }) {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const options = TAG_OPTIONS[fieldType] || [];
  const selectedTags = value ? value.split(',').map(t => t.trim()).filter(t => t) : [];
  
  const filteredOptions = options.filter(
    opt => !selectedTags.includes(opt) && 
    opt.toLowerCase().includes(inputValue.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addTag = (tag) => {
    const newTags = [...selectedTags, tag];
    onChange(newTags.join(', '));
    setInputValue('');
    setShowDropdown(false);
  };

  const removeTag = (tag) => {
    const newTags = selectedTags.filter(t => t !== tag);
    onChange(newTags.join(', '));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex flex-wrap gap-2 p-2 border border-slate-300 rounded-md bg-white focus-within:ring-2 focus-within:ring-blue-500">
        {selectedTags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
            {TAG_LABELS[tag] || tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              disabled={disabled}
              className="hover:opacity-70"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => {
            setTimeout(() => onBlur?.(), 100);
          }}
          placeholder={selectedTags.length === 0 ? 'Select or type...' : ''}
          disabled={disabled}
          className="flex-1 min-w-32 outline-none bg-transparent text-sm"
        />
      </div>

      {showDropdown && filteredOptions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 border border-slate-300 bg-white rounded-md shadow-lg z-10">
          {filteredOptions.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => addTag(opt)}
              className="w-full text-left px-3 py-2 hover:bg-slate-100 text-sm"
            >
              {TAG_LABELS[opt] || opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}