import * as RadixTabs from '@radix-ui/react-tabs';
import { forwardRef } from 'react';

export const Tabs = RadixTabs.Root;

export const TabsList = forwardRef<
  HTMLDivElement,
  RadixTabs.TabsListProps & { className?: string }
>(({ className = '', ...props }, ref) => (
  <RadixTabs.List ref={ref} className={className} {...props} />
));

TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<
  HTMLButtonElement,
  RadixTabs.TabsTriggerProps & { className?: string }
>(({ className = '', ...props }, ref) => (
  <RadixTabs.Trigger ref={ref} className={className} {...props} />
));

TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  HTMLDivElement,
  RadixTabs.TabsContentProps & { className?: string }
>(({ className = '', ...props }, ref) => (
  <RadixTabs.Content ref={ref} className={className} {...props} />
));

TabsContent.displayName = 'TabsContent';
