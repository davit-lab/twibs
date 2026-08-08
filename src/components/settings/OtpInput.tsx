import { useRef } from 'react';
import { cn } from '@/lib/utils';

const CODE_LENGTH = 6;

interface OtpInputProps {
  value: string[];
  onChange: (digits: string[]) => void;
  autoFocus?: boolean;
}

export default function OtpInput({ value, onChange, autoFocus }: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, input: string) => {
    const clean = input.replace(/\D/g, '').slice(-1);
    const next = [...value];
    next[index] = clean;
    onChange(next);
    if (clean && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(CODE_LENGTH).fill('');
    pasted.split('').forEach((ch, i) => (next[i] = ch));
    onChange(next);
    inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { inputsRef.current[index] = el; }}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={autoFocus && index === 0}
          maxLength={1}
          aria-label={`Digit ${index + 1}`}
          className={cn(
            'w-11 h-12 rounded-xl border text-center text-lg font-bold tabular-nums outline-none transition-all',
            'focus:border-primary focus:ring-2 focus:ring-primary/30',
            digit ? 'border-primary bg-primary/5' : 'border-border bg-card'
          )}
        />
      ))}
    </div>
  );
}
