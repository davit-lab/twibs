import { useState, useEffect, useMemo, useRef } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { countries, popularCountries, searchCountries, type Country } from '@/lib/countryCodes';
import { cn } from '@/lib/utils';

interface CountryCodeSelectorProps {
  value: string;
  onChange: (country: Country) => void;
  disabled?: boolean;
}

export default function CountryCodeSelector({
  value,
  onChange,
  disabled = false,
}: CountryCodeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedCountry = useMemo(
    () => countries.find(c => c.code === value) || countries.find(c => c.code === 'US'),
    [value]
  );

  // Focus search input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchQuery('');
    }
  }, [open]);

  const filteredCountries = useMemo(() => {
    if (!searchQuery) {
      // Show popular countries first, then the rest
      const popular = popularCountries
        .map(code => countries.find(c => c.code === code))
        .filter(Boolean) as Country[];
      const rest = countries.filter(c => !popularCountries.includes(c.code));
      return [...popular, ...rest];
    }
    return searchCountries(searchQuery);
  }, [searchQuery]);

  const handleSelect = (country: Country) => {
    onChange(country);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-[120px] justify-between px-3 font-normal"
        >
          <span className="flex items-center gap-2">
            <span className="text-lg">{selectedCountry?.flag}</span>
            <span className="text-sm">{selectedCountry?.dialCode}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 bg-popover border border-border" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-1">
            {!searchQuery && (
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Popular
              </div>
            )}
            {filteredCountries.map((country, index) => {
              const isPopular = popularCountries.includes(country.code);
              const showDivider = !searchQuery && index === popularCountries.length;
              
              return (
                <div key={country.code}>
                  {showDivider && (
                    <>
                      <div className="my-1 border-t border-border" />
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        All Countries
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => handleSelect(country)}
                    className={cn(
                      'flex items-center gap-3 w-full px-2 py-2 text-sm rounded-md transition-colors',
                      'hover:bg-muted',
                      selectedCountry?.code === country.code && 'bg-primary/10'
                    )}
                  >
                    <span className="text-lg">{country.flag}</span>
                    <span className="flex-1 text-left truncate">{country.name}</span>
                    <span className="text-muted-foreground">{country.dialCode}</span>
                    {selectedCountry?.code === country.code && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                </div>
              );
            })}
            {filteredCountries.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No countries found
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
