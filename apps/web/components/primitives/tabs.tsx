"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
}

export function Tabs({
  tabs,
  activeTab: controlledTab,
  defaultTab,
  onChange,
  className,
}: TabsProps) {
  const [internalTab, setInternalTab] = useState(
    defaultTab ?? tabs[0]?.id ?? ""
  );
  const activeTab = controlledTab ?? internalTab;
  const indicatorRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleTabClick = useCallback(
    (tabId: string) => {
      if (!controlledTab) {
        setInternalTab(tabId);
      }
      onChange?.(tabId);
    },
    [controlledTab, onChange]
  );

  useEffect(() => {
    const activeEl = tabsRef.current.get(activeTab);
    const indicator = indicatorRef.current;
    if (activeEl && indicator) {
      indicator.style.left = `${activeEl.offsetLeft}px`;
      indicator.style.width = `${activeEl.offsetWidth}px`;
    }
  }, [activeTab]);

  return (
    <div
      className={cn(
        "relative flex border-b border-zinc-800",
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(el) => {
            if (el) tabsRef.current.set(tab.id, el);
            else tabsRef.current.delete(tab.id);
          }}
          onClick={() => handleTabClick(tab.id)}
          className={cn(
            "relative px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer",
            activeTab === tab.id
              ? "text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-xs",
                activeTab === tab.id
                  ? "bg-zinc-700 text-zinc-200"
                  : "bg-zinc-800 text-zinc-500"
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
      <div
        ref={indicatorRef}
        className="absolute bottom-0 h-0.5 bg-accent transition-all duration-200"
      />
    </div>
  );
}

export interface TabPanelProps {
  active: boolean;
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ active, children, className }: TabPanelProps) {
  if (!active) return null;
  return <div className={cn("py-4", className)}>{children}</div>;
}
