// Underlined tabs with count badges — the standard tab menu style across Servio

export const underlineTabsList =
  'h-auto w-full justify-start gap-6 overflow-x-auto overflow-y-hidden rounded-none border-b bg-transparent p-0';

export const underlineTabsTrigger =
  'group -mb-px gap-2 rounded-none border-b-2 border-transparent px-0.5 pb-2.5 pt-1 text-muted-foreground shadow-none ' +
  'data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none';

export const tabCountBadge =
  'rounded-full bg-muted px-2 py-px text-xs font-medium text-muted-foreground ' +
  'group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary';
