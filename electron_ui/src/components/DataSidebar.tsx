import React from 'react';
import { IconChevronRight, IconChevronDown } from './Icons';

interface SidebarItem {
  type: string;
  id: string | null;
}

interface DataSidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (val: boolean) => void;
  searchQuery: string;
  activeCategory: string;
  activeSubId: string | null;
  selectCategory: (cat: any, subId: string | null) => void;
  toggleCategory: (cat: string) => void;
  isHighlighted: (type: string, id: string | null) => boolean;
  getUnfinishedCount: (cat: any, subId?: string) => number;
  expandedCategories: string[];
  
  // Customization
  generalLabel: string;
  generalIcon: React.ReactNode;
  liveLabel: string;
  liveIcon: React.ReactNode;
  liveItems: { id: string; name: string; priority: string; count: number }[];
  templatesLabel: string;
  templatesIcon: React.ReactNode;
  templateItems: any[];
}

export default function DataSidebar({
  isSidebarOpen,
  setIsSidebarOpen,
  searchQuery,
  activeCategory,
  activeSubId,
  selectCategory,
  toggleCategory,
  isHighlighted,
  getUnfinishedCount,
  expandedCategories,
  generalLabel,
  generalIcon,
  liveLabel,
  liveIcon,
  liveItems,
  templatesLabel,
  templatesIcon,
  templateItems
}: DataSidebarProps) {

  return (
    <div style={{
      width: isSidebarOpen ? '180px' : '0px',
      opacity: isSidebarOpen ? 1 : 0,
      backgroundColor: 'rgba(0, 33, 43, 0.4)',
      borderRight: isSidebarOpen ? '1px solid var(--border-glass)' : '0px solid transparent',
      display: 'flex',
      flexDirection: 'column',
      padding: isSidebarOpen ? '16px 12px' : '16px 0',
      overflowY: 'auto',
      overflowX: 'hidden',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      visibility: isSidebarOpen ? 'visible' : 'hidden',
      whiteSpace: 'nowrap'
    }}>
      {/* General */}
      {(!isSidebarOpen || !searchQuery || generalLabel.toLowerCase().includes(searchQuery.toLowerCase())) && (
        <div 
          className="interactive-element"
          onClick={() => { selectCategory('general', null); setIsSidebarOpen(false); window.dispatchEvent(new CustomEvent('clear-search-query')); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { selectCategory('general', null); setIsSidebarOpen(false); window.dispatchEvent(new CustomEvent('clear-search-query')); } }}
          tabIndex={0}
          style={{
            padding: '6px 12px',
            margin: '2px 0',
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: activeCategory === 'general' || isHighlighted('general', null) ? 'rgba(38, 139, 210, 0.15)' : 'transparent',
            boxShadow: isHighlighted('general', null) ? 'inset 0 0 0 1px var(--accent-blue)' : 'none',
            color: activeCategory === 'general' ? 'var(--accent-blue)' : 'var(--text-main)',
            fontSize: '13px',
            fontWeight: activeCategory === 'general' ? '700' : '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span style={{ 
            backgroundColor: activeCategory === 'general' ? 'var(--accent-blue)' : (getUnfinishedCount('general') === 0 ? 'rgba(88, 110, 117, 0.15)' : 'rgba(181, 137, 0, 0.15)'), 
            color: activeCategory === 'general' ? '#fff' : (getUnfinishedCount('general') === 0 ? 'var(--text-dim)' : 'var(--accent-yellow)'), 
            padding: '2px 6px', 
            borderRadius: '10px', 
            fontSize: '10px', 
            fontWeight: 'bold',
            minWidth: '14px',
            textAlign: 'center',
            lineHeight: '1'
          }}>
            {getUnfinishedCount('general')}
          </span>
          {generalIcon}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{generalLabel}</span>
        </div>
      )}

      {/* Templates (No Header) */}
      <div>
        {templateItems.map((template: any) => {
          const isActive = activeCategory === 'templates' && activeSubId === template.name;
          return (
            <div 
              key={template.name}
              className="interactive-element"
              onClick={() => { selectCategory('templates', template.name); setIsSidebarOpen(false); window.dispatchEvent(new CustomEvent('clear-search-query')); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { selectCategory('templates', template.name); setIsSidebarOpen(false); window.dispatchEvent(new CustomEvent('clear-search-query')); } }}
              tabIndex={0}
              style={{
                padding: '6px 12px',
                margin: '2px 0',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor: isActive || isHighlighted('templates', template.name) ? 'rgba(38, 139, 210, 0.15)' : 'transparent',
                boxShadow: isHighlighted('templates', template.name) ? 'inset 0 0 0 1px var(--accent-blue)' : 'none',
                color: isActive ? 'var(--accent-blue)' : 'var(--text-main)',
                fontSize: '13px',
                fontWeight: isActive ? '700' : '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span style={{ 
                backgroundColor: isActive ? 'var(--accent-blue)' : (getUnfinishedCount('templates', template.name) === 0 ? 'rgba(88, 110, 117, 0.15)' : 'rgba(181, 137, 0, 0.15)'), 
                color: isActive ? '#fff' : (getUnfinishedCount('templates', template.name) === 0 ? 'var(--text-dim)' : 'var(--accent-yellow)'), 
                padding: '2px 6px', 
                borderRadius: '10px', 
                fontSize: '10px', 
                fontWeight: 'bold',
                minWidth: '14px',
                textAlign: 'center',
                lineHeight: '1'
              }}>
                {getUnfinishedCount('templates', template.name)}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
