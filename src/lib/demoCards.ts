
export type DemoCard = {
  id: string;
  nickname: string;
  issuer: string;
  lastFour: string;
  type: 'Debit' | 'Credit';
  balance: number;
};

const STORAGE_KEY = 'signalzero-demo-cards';

export function getDemoCards(): DemoCard[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) as DemoCard[] : [];
  } catch {
    return [];
  }
}

export function saveDemoCard(
  card: Omit<DemoCard, 'id'>,
): DemoCard[] {
  const cards = getDemoCards();

  const next = [
    ...cards,
    { ...card, id: crypto.randomUUID() },
  ];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteDemoCard(id: string): DemoCard[] {
  const next = getDemoCards().filter((card) => card.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
