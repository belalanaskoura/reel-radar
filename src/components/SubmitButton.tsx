'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode, CSSProperties } from 'react';

// useFormStatus only reports the pending state of the nearest enclosing
// <form>, and only works inside a Client Component -- so this has to be
// its own leaf rather than a prop on the (Server Component) page, per
// emil-design-eng's requirement that a save action gives real feedback,
// not just a static button with no sense of "did this register."
export function SubmitButton({
  children,
  pendingLabel,
  className,
  style,
}: {
  children: ReactNode;
  pendingLabel: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className} style={style}>
      {pending ? pendingLabel : children}
    </button>
  );
}
