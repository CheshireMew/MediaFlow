
import React, { useId, useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
    value: string;
    label: string;
}

interface SelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    ariaLabel?: string;
}

export const Select: React.FC<SelectProps> = ({ 
    value, 
    onChange, 
    options, 
    placeholder = "",
    className = "",
    disabled = false,
    ariaLabel,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listboxId = useId();
    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
        triggerRef.current?.focus();
    };

    const openMenu = (preferredIndex?: number) => {
        if (disabled) return;
        const selectedIndex = options.findIndex(option => option.value === value);
        const fallbackIndex = selectedIndex >= 0 ? selectedIndex : options.length > 0 ? 0 : -1;
        setActiveIndex(preferredIndex ?? fallbackIndex);
        setIsOpen(true);
    };

    const moveActive = (direction: 1 | -1) => {
        if (options.length === 0) return;
        const current = activeIndex >= 0 ? activeIndex : 0;
        setActiveIndex((current + direction + options.length) % options.length);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (!isOpen) openMenu();
                else moveActive(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                if (!isOpen) openMenu(options.length - 1);
                else moveActive(-1);
                break;
            case 'Home':
                if (!isOpen || options.length === 0) return;
                event.preventDefault();
                setActiveIndex(0);
                break;
            case 'End':
                if (!isOpen || options.length === 0) return;
                event.preventDefault();
                setActiveIndex(options.length - 1);
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                if (!isOpen) openMenu();
                else if (activeIndex >= 0) handleSelect(options[activeIndex].value);
                break;
            case 'Escape':
                if (!isOpen) return;
                event.preventDefault();
                setIsOpen(false);
                break;
            case 'Tab':
                setIsOpen(false);
                break;
        }
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                aria-activedescendant={isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
                onClick={() => isOpen ? setIsOpen(false) : openMenu()}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm bg-black/20 border border-white/10 rounded-lg transition-all
                    ${isOpen ? 'border-indigo-500/50 ring-1 ring-indigo-500/50' : 'hover:border-white/20'}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}
            >
                <span className={`truncate ${!selectedOption ? 'text-slate-400' : ''}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown 
                    size={16} 
                    className={`ml-2 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && (
                <div
                    id={listboxId}
                    role="listbox"
                    className="absolute z-50 w-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                >
                    <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                        {options.map((option, index) => (
                            <div
                                key={option.value}
                                id={`${listboxId}-option-${index}`}
                                role="option"
                                aria-selected={option.value === value}
                                onMouseEnter={() => setActiveIndex(index)}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => handleSelect(option.value)}
                                className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors text-left
                                    ${option.value === value 
                                        ? 'bg-indigo-600 text-white' 
                                        : index === activeIndex
                                            ? 'bg-white/10 text-white'
                                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                <span className="truncate">{option.label}</span>
                                {option.value === value && <Check size={14} />}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
