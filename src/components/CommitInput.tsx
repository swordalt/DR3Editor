import React, { useEffect, useRef, useState } from 'react';
import { stripInputWhitespace } from '../utils/inputSanitization';

interface CommitInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'onKeyDown'> {
  value: string | number;
  onCommit: (value: string) => void;
}

export default function CommitInput({ value, onCommit, ...inputProps }: CommitInputProps) {
  const [draftValue, setDraftValue] = useState(String(value ?? ''));
  const lastCommittedDraftRef = useRef(String(value ?? ''));

  useEffect(() => {
    const nextValue = String(value ?? '');
    setDraftValue(nextValue);
    lastCommittedDraftRef.current = nextValue;
  }, [value]);

  const commitDraft = () => {
    const sanitizedDraftValue = stripInputWhitespace(draftValue);
    if (sanitizedDraftValue === lastCommittedDraftRef.current) {
      if (sanitizedDraftValue !== draftValue) {
        setDraftValue(sanitizedDraftValue);
      }
      return;
    }

    setDraftValue(sanitizedDraftValue);
    lastCommittedDraftRef.current = sanitizedDraftValue;
    onCommit(sanitizedDraftValue);
  };

  return (
    <input
      {...inputProps}
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commitDraft();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
