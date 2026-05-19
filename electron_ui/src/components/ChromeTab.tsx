import { useState, useEffect } from 'react';
import { IconChrome, IconRocket } from './Icons';

interface ChromeProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export default function ChromeTab({ searchQuery = '' }: { searchQuery?: string }) {
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when search query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.fetchChromeProfiles) {
      // @ts-ignore
      window.electronAPI.fetchChromeProfiles().then((data: ChromeProfile[]) => {
        setProfiles(data || []);
        setLoading(false);
      }).catch((err: any) => {
        console.error("Failed to fetch Chrome profiles", err);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const launchProfile = (id: string) => {
    // @ts-ignore
    window.electronAPI.executeCommand(`google-chrome --profile-directory="${id}"`);
  };

  const filtered = profiles
    .filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filtered.length === 0) return;

      if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j')) {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k')) {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          launchProfile(filtered[selectedIndex].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex]);

  const getProfileImage = (profile: ChromeProfile) => {
    // If we have a local gaia picture that isn't a placeholder, use it
    if (profile.avatar && !profile.avatar.includes('gstatic.com') && !profile.avatar.includes('generate_204')) {
      return profile.avatar;
    }
    // Fallback: Fetch official Google/Gmail profile image if email is present
    if (profile.email && profile.email.includes('@')) {
      return `https://www.google.com/s2/photos/profile/${profile.email}?sz=96`;
    }
    return null;
  };

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#565f89' }}>
      <div style={{ marginBottom: '12px' }}>
        <IconChrome size={32} color="#3b4261" />
      </div>
      Scanning for Google Chrome profiles...
    </div>
  );

  return (
    <div style={{ 
      padding: '16px 20px', 
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      animation: 'fadeInScale 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      overflowY: 'auto',
      height: '100%'
    }} className="custom-scrollbar">
      {filtered.map((profile, index) => {
        const isSelected = index === selectedIndex;
        return (
          <div 
            key={profile.id}
            onClick={() => launchProfile(profile.id)}
            className={`unified-glass-card interactive-element ${isSelected ? 'lifted-card' : ''}`}
            style={{
              backgroundColor: isSelected ? 'rgba(122, 162, 247, 0.1)' : 'rgba(30, 32, 48, 0.45)',
              border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              cursor: 'pointer',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
              transform: isSelected ? 'translateX(4px)' : 'none',
              boxShadow: isSelected ? '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px rgba(122, 162, 247, 0.1)' : 'none',
              borderLeft: isSelected ? '4px solid var(--accent-blue)' : '4px solid transparent',
            }}
            onMouseEnter={() => setSelectedIndex(index)}
          >
          {isSelected && <div className="active-pillar" />}
          
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'rgba(41, 46, 66, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
            flexShrink: 0,
            boxShadow: isSelected ? '0 0 10px rgba(122, 162, 247, 0.2)' : 'none'
          }}>
            <img 
              src={getProfileImage(profile) || ''} 
              alt="" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://www.google.com/favicon.ico';
                (e.target as HTMLImageElement).style.padding = '8px';
              }}
            />
          </div>
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              color: isSelected ? 'var(--accent-cyan)' : 'var(--text-main)', 
              fontWeight: '700', 
              fontSize: '15px', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              marginBottom: '2px',
              transition: 'color 0.2s'
            }}>
              {profile.name}
            </div>
            <div style={{ 
              color: 'var(--text-dim)', 
              fontSize: '13px', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              opacity: isSelected ? 1 : 0.8,
              transition: 'opacity 0.2s'
            }}>
              {profile.email}
            </div>
          </div>

          <div className="launch-icon" style={{ 
            opacity: isSelected ? 1 : 0.3, 
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            background: isSelected ? 'rgba(122, 162, 247, 0.15)' : 'transparent',
            padding: '8px',
            borderRadius: '8px',
            transform: isSelected ? 'scale(1.1)' : 'scale(1)',
          }}>
            <IconRocket size={16} color={isSelected ? 'var(--accent-blue)' : 'var(--text-dim)'} />
          </div>
        </div>
      )})}
      
      {filtered.length === 0 && (
        <div style={{ 
          padding: '60px 20px', 
          textAlign: 'center', 
          color: 'var(--text-dim)',
          background: 'rgba(30, 32, 48, 0.3)',
          borderRadius: '12px',
          border: '1px dashed var(--border-glass)'
        }}>
          No profiles found matching "{searchQuery}"
        </div>
      )}
    </div>
  );
}
