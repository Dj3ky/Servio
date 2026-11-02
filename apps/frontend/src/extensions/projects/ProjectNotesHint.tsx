import { StickyNote } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Icon next to the project name that previews the project's own notes on hover
export function ProjectNotesHint({ notes }: { notes: string | null | undefined }) {
  if (!notes?.trim()) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <StickyNote className="h-3.5 w-3.5 shrink-0 text-amber-500 cursor-help" onClick={e => e.stopPropagation()} />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-sm whitespace-pre-wrap text-xs">{notes}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
