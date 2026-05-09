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
      padding: '10px 12px', 
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      animation: 'fadeIn 0.2s ease'
    }}>
      {filtered.map((profile, index) => {
        const isSelected = index === selectedIndex;
        return (
          <div 
            key={profile.id}
            onClick={() => launchProfile(profile.id)}
            style={{
              backgroundColor: isSelected ? '#24283b' : '#1f2335',
              border: isSelected ? '1px solid #7aa2f7' : '1px solid #3b4261',
              borderRadius: '8px',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              height: '60px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              position: 'relative',
              transform: isSelected ? 'translateX(4px)' : 'translateX(0)',
            }}
            onMouseEnter={() => setSelectedIndex(index)}
          >
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: '#292e42',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            border: '1px solid #3b4261',
            flexShrink: 0,
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
              color: '#c8d3f5', 
              fontWeight: '600', 
              fontSize: '15px', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              marginBottom: '2px'
            }}>
              {profile.name}
            </div>
            <div style={{ 
              color: '#9499b8', 
              fontSize: '13px', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              opacity: 0.9
            }}>
              {profile.email}
            </div>
          </div>

          <div className="launch-icon" style={{ 
            opacity: isSelected ? 1 : 0.2, 
            transition: 'opacity 0.2s ease',
            display: 'flex',
            alignItems: 'center',
          }}>
            <IconRocket size={14} color="#7aa2f7" />
          </div>
        </div>
      )})}
      
      {filtered.length === 0 && (
        <div style={{ 
          padding: '40px 20px', 
          textAlign: 'center', 
          color: '#565f89',
        }}>
          No profiles found matching "{searchQuery}"
        </div>
      )}
    </div>
  );
}
