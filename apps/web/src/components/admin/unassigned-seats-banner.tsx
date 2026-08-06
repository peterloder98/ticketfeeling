"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type UnassignedSeatsContextValue = {
  unassignedCount: number;
  setUnassignedCount: (count: number) => void;
};

const UnassignedSeatsContext = createContext<UnassignedSeatsContextValue | null>(null);

export function UnassignedSeatsProvider({
  initialCount,
  children,
}: {
  initialCount: number;
  children: ReactNode;
}) {
  const [unassignedCount, setUnassignedCountState] = useState(Math.max(0, initialCount));

  useEffect(() => {
    setUnassignedCountState(Math.max(0, initialCount));
  }, [initialCount]);

  const setUnassignedCount = useCallback((count: number) => {
    setUnassignedCountState(Math.max(0, Math.floor(count)));
  }, []);

  const value = useMemo(
    () => ({ unassignedCount, setUnassignedCount }),
    [unassignedCount, setUnassignedCount],
  );

  return (
    <UnassignedSeatsContext.Provider value={value}>{children}</UnassignedSeatsContext.Provider>
  );
}

export function useUnassignedSeatsReporter() {
  return useContext(UnassignedSeatsContext);
}

/** Gold banner: live unassigned count so it clears as soon as Zuordnung is done. */
export function UnassignedSeatsBanner({
  seatingCategoriesCount,
}: {
  seatingCategoriesCount: number;
}) {
  const ctx = useContext(UnassignedSeatsContext);
  const count = ctx?.unassignedCount ?? 0;
  if (count <= 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-[rgba(214,166,66,0.45)] bg-[rgba(214,166,66,0.12)] px-4 py-3">
      <p className="text-sm font-semibold text-[var(--tf-navy)]">
        Nächster Schritt: Saalplan zuordnen
      </p>
      <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
        {count} Plätze ohne Kategorie — unter „Saalplan-Zuordnung“ Kategorie wählen und Bereich
        oder Plätze antippen
        {seatingCategoriesCount === 0
          ? " — bei Bedarf dort eine Preiskategorie anlegen."
          : ". Preise kannst du darunter bearbeiten."}
      </p>
      <a href="#zuordnung" className="tf-btn tf-btn-primary mt-3 inline-flex !min-h-10 text-sm">
        Jetzt zuordnen
      </a>
    </div>
  );
}
