/**
 * Configurable puzzle questions shown before the user can make a move.
 * Add, remove, or reorder questions to customize the thinking process for different users.
 */
export interface PuzzleQuestion {
  id: string;
  label: string;
  placeholder?: string;
  /** Input type - can be extended for future customization (e.g. 'select', 'checkbox') */
  type?: "text" | "textarea";
  /** When set, clicking this question enables arrow-drawing mode on the board to add moves */
  arrowMode?: "checks" | "captures" | "attacks";
}

export const PUZZLE_QUESTIONS: PuzzleQuestion[] = [
  {
    id: "opponent_threat",
    label: "What is the opponent's threat?",
    placeholder: "Describe the threat...",
  },
  {
    id: "checks",
    label: "Do I have any checks?",
    placeholder: "Click to draw arrows, or type...",
    arrowMode: "checks",
  },
  {
    id: "captures",
    label: "Do I have any captures?",
    placeholder: "Click to draw arrows, or type...",
    arrowMode: "captures",
  },
  {
    id: "attacks",
    label: "Do I have any attacks?",
    placeholder: "Click to draw arrows, or type...",
    arrowMode: "attacks",
  },
];
