import { useState, useEffect } from 'react';
import { supabase } from '../../api/supabaseClient';
import { 
  Save, Plus, Trash2, ArrowLeft, RefreshCw, Layers, Users, ShieldAlert, 
  Search, Award, KeyRound, CheckCircle, ShieldX
} from 'lucide-react';

export default function AdminContentManager({ onClose }) {
  // Tabs: 'content' | 'players' | 'moderation'
  const [activeTab, setActiveTab] = useState('content');

  // Loading states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Content Tab States
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [steps, setSteps] = useState([]);

  // Players Tab States
  const [players, setPlayers] = useState([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [editXpValue, setEditXpValue] = useState(0);
  const [editKeysValue, setEditKeysValue] = useState(0);

  // Moderation Tab States
  const [posts, setPosts] = useState([]);
  const [postSearch, setPostSearch] = useState('');

  // ----------------------------------------------------
  // Initial & Tab Fetchers
  // ----------------------------------------------------
  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'content') {
        const { data, error } = await supabase
          .from('story_nodes')
          .select('*')
          .order('order', { ascending: true });
        if (error) throw error;
        setNodes(data || []);
        if (data && data.length > 0 && !selectedNode) {
          selectNode(data[0]);
        }
      } else if (activeTab === 'players') {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('display_name', { ascending: true });
        if (error) throw error;
        setPlayers(data || []);
      } else if (activeTab === 'moderation') {
        const { data, error } = await supabase
          .from('feed_posts')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setPosts(data || []);
      }
    } catch (e) {
      console.error(`Failed fetching data for tab ${activeTab}:`, e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ----------------------------------------------------
  // Tab 1: Content CRUD actions
  // ----------------------------------------------------
  const selectNode = async (node) => {
    setSelectedNode(node);
    setChallenge(null);
    setSteps([]);

    if (node.type === 'CHALLENGE') {
      try {
        const { data: challengeData } = await supabase
          .from('challenges')
          .select('*')
          .eq('story_node_id', node.id)
          .single();

        if (challengeData) {
          setChallenge(challengeData);

          const { data: stepsData } = await supabase
            .from('challenge_steps')
            .select('*')
            .eq('challenge_id', challengeData.id)
            .order('order', { ascending: true });

          setSteps(stepsData || []);
        } else {
          // Empty setup
          setChallenge({
            id: 'c-' + node.id,
            story_node_id: node.id,
            title: node.title,
            description: '',
            why_text: '',
            proof_type: 'PHOTO',
            reward_keys: 1,
            reward_xp: 10
          });
          setSteps([]);
        }
      } catch (e) {
        console.error('Error fetching challenge details:', e);
      }
    }
  };

  const handleSaveContent = async () => {
    if (!selectedNode) return;
    setSaving(true);
    try {
      const { error: nodeErr } = await supabase
        .from('story_nodes')
        .upsert(selectedNode);

      if (nodeErr) throw nodeErr;

      if (selectedNode.type === 'CHALLENGE' && challenge) {
        const { error: chalErr } = await supabase
          .from('challenges')
          .upsert(challenge);

        if (chalErr) throw chalErr;

        await supabase.from('challenge_steps').delete().eq('challenge_id', challenge.id);
        if (steps.length > 0) {
          const formattedSteps = steps.map((s, index) => ({
            id: s.id || `cs-${challenge.id}-${index}`,
            challenge_id: challenge.id,
            order: index + 1,
            text: s.text
          }));
          const { error: stepsErr } = await supabase
            .from('challenge_steps')
            .insert(formattedSteps);

          if (stepsErr) throw stepsErr;
        }
      }

      alert('Změny v obsahu byly uloženy.');
      fetchData();
    } catch (e) {
      alert('Chyba ukládání: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddNode = () => {
    const nextOrder = nodes.length;
    const newNode = {
      id: 'n-node-' + nextOrder,
      theme_id: 't-env-reset',
      order: nextOrder,
      type: 'CHALLENGE',
      title: `Nový Uzel ${nextOrder}`,
      cutscene_text: 'Zadej text...',
      requires_pass: false
    };
    setNodes([...nodes, newNode]);
    setSelectedNode(newNode);
    setChallenge(null);
    setSteps([]);
  };

  // ----------------------------------------------------
  // Tab 2: Players management actions
  // ----------------------------------------------------
  const handleSelectPlayer = (player) => {
    setSelectedPlayer(player);
    setEditXpValue(player.xp || 0);
    setEditKeysValue(player.keys_balance || 0);
  };

  const handleSavePlayer = async () => {
    if (!selectedPlayer) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          xp: editXpValue,
          keys_balance: editKeysValue,
          pass_holder: selectedPlayer.pass_holder,
          is_admin: selectedPlayer.is_admin
        })
        .eq('id', selectedPlayer.id);

      if (error) throw error;
      alert('Profil hráče byl úspěšně aktualizován.');
      setSelectedPlayer(null);
      fetchData();
    } catch (e) {
      alert('Chyba při ukládání hráče: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ----------------------------------------------------
  // Tab 3: Moderation actions
  // ----------------------------------------------------
  const handleTogglePostPublic = async (post) => {
    try {
      const nextPublic = !post.is_public;
      const { error } = await supabase
        .from('feed_posts')
        .update({ is_public: nextPublic })
        .eq('id', post.id);

      if (error) throw error;
      setPosts(posts.map(p => p.id === post.id ? { ...p, is_public: nextPublic } : p));
    } catch (e) {
      alert('Nepodařilo se změnit viditelnost příspěvku: ' + e.message);
    }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Opravdu chceš smazat tento důkaz z feedu?')) return;
    try {
      const { error } = await supabase
        .from('feed_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;
      setPosts(posts.filter(p => p.id !== postId));
    } catch (e) {
      alert('Smazání selhalo: ' + e.message);
    }
  };

  // Filters
  const filteredPlayers = players.filter(p => 
    (p.display_name || '').toLowerCase().includes(playerSearch.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(playerSearch.toLowerCase())
  );

  const filteredPosts = posts.filter(p => 
    (p.user_name || '').toLowerCase().includes(postSearch.toLowerCase()) ||
    (p.content || '').toLowerCase().includes(postSearch.toLowerCase())
  );

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: '#0D0A18',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Header bar */}
      <div style={{
        height: '65px',
        borderBottom: '1px solid #1B1430',
        background: '#0A0712',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#6B6B8A',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'Inter',
              fontWeight: '600',
              fontSize: '13px'
            }}
          >
            <ArrowLeft size={16} /> Zpět do Hry
          </button>
          <span style={{ color: '#1B1430' }}>|</span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '15px', color: '#fff' }}>
            Správa obsahu <span style={{ color: '#A78BFA' }}>ADMIN</span>
          </span>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', background: '#130F24', borderRadius: '10px', padding: '3px', border: '1px solid #1B1430' }}>
          <button 
            onClick={() => setActiveTab('content')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'content' ? '#7C3AED' : 'transparent',
              color: activeTab === 'content' ? '#fff' : '#6B6B8A',
              fontFamily: 'Inter',
              fontWeight: '600',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <Layers size={13} /> Příběh & Výzvy
          </button>
          <button 
            onClick={() => setActiveTab('players')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'players' ? '#7C3AED' : 'transparent',
              color: activeTab === 'players' ? '#fff' : '#6B6B8A',
              fontFamily: 'Inter',
              fontWeight: '600',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <Users size={13} /> Hráči
          </button>
          <button 
            onClick={() => setActiveTab('moderation')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'moderation' ? '#7C3AED' : 'transparent',
              color: activeTab === 'moderation' ? '#fff' : '#6B6B8A',
              fontFamily: 'Inter',
              fontWeight: '600',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <ShieldAlert size={13} /> Moderace
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={fetchData}
            style={{
              width: '36px',
              height: '36px',
              background: '#1C1630',
              border: '1px solid #382C5C',
              borderRadius: '10px',
              color: '#9A9AB5',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {activeTab === 'content' && (
            <button 
              onClick={handleSaveContent}
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#7C3AED',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '0 18px',
                fontFamily: 'Inter',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
                opacity: saving ? 0.6 : 1
              }}
            >
              <Save size={14} /> {saving ? 'Ukládám...' : 'Uložit obsah'}
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* ==================================================== */}
        {/* TAB 1: CONTENT CRUD VIEW                             */}
        {/* ==================================================== */}
        {activeTab === 'content' && (
          <>
            {/* LEFT COLUMN: Nodes list */}
            <div style={{
              width: '280px',
              borderRight: '1px solid #1B1430',
              background: '#090611',
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              flexShrink: 0
            }}>
              <div style={{ fontFamily: 'Inter', fontWeight: '700', fontSize: '11px', color: '#6B6B8A', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
                Seznam uzlů příběhu
              </div>

              {nodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                return (
                  <div 
                    key={node.id}
                    onClick={() => selectNode(node)}
                    style={{
                      background: isSelected ? 'rgba(124,58,237,.14)' : 'transparent',
                      border: isSelected ? '1px solid #7C3AED' : '1px solid transparent',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: isSelected ? '#7C3AED' : '#1C1630',
                      color: isSelected ? '#fff' : '#9A9AB5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11px',
                      fontWeight: '700'
                    }}>
                      {node.order}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', color: isSelected ? '#fff' : '#9A9AB5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {node.title}
                      </div>
                      <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A', marginTop: '2px' }}>
                        {node.type} {node.requires_pass && '🔒'}
                      </div>
                    </div>
                  </div>
                );
              })}

              <button 
                onClick={handleAddNode}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  width: '100%',
                  height: '42px',
                  background: 'transparent',
                  border: '1.5px dashed #382C5C',
                  borderRadius: '12px',
                  color: '#A78BFA',
                  fontFamily: 'Inter',
                  fontWeight: '600',
                  fontSize: '13px',
                  cursor: 'pointer',
                  marginTop: '10px'
                }}
              >
                <Plus size={14} /> Přidat uzel
              </button>
            </div>

            {/* RIGHT COLUMN: Node editor workspace */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {selectedNode ? (
                <>
                  <div style={{ background: '#15111E', border: '1px solid #1C1630', borderRadius: '16px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '16px', color: '#fff' }}>
                        Základní nastavení uzlu
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5' }}>
                        <input 
                          type="checkbox"
                          checked={selectedNode.requires_pass || false}
                          onChange={(e) => setSelectedNode({ ...selectedNode, requires_pass: e.target.checked })}
                        />
                        Vyžaduje Hra Pass 🔒
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>Název uzlu</label>
                        <input 
                          type="text"
                          value={selectedNode.title || ''}
                          onChange={(e) => setSelectedNode({ ...selectedNode, title: e.target.value })}
                          style={{ width: '100%', height: '42px', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '10px', padding: '0 12px', color: '#fff', fontFamily: 'Inter', fontSize: '13px' }}
                        />
                      </div>
                      <div style={{ width: '200px' }}>
                        <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>Typ uzlu</label>
                        <select 
                          value={selectedNode.type || 'CHALLENGE'}
                          onChange={(e) => setSelectedNode({ ...selectedNode, type: e.target.value })}
                          style={{ width: '100%', height: '42px', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '10px', padding: '0 10px', color: '#fff', fontFamily: 'Inter', fontSize: '13px' }}
                        >
                          <option value="INTRO">INTRO</option>
                          <option value="CHALLENGE">CHALLENGE</option>
                          <option value="REFERENTIAL">REFERENTIAL</option>
                          <option value="FINAL">FINAL</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Text Dialogu (Zaya cutscene)
                      </label>
                      <textarea 
                        value={selectedNode.cutscene_text || ''}
                        onChange={(e) => setSelectedNode({ ...selectedNode, cutscene_text: e.target.value })}
                        rows={4}
                        style={{ width: '100%', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '10px', padding: '12px', color: '#fff', fontFamily: 'Inter', fontSize: '13px', lineHeight: '1.5', resize: 'vertical' }}
                      />
                    </div>
                  </div>

                  {selectedNode.type === 'CHALLENGE' && challenge && (
                    <div style={{ background: '#15111E', border: '1px solid #1C1630', borderRadius: '16px', padding: '20px' }}>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '16px', color: '#fff', marginBottom: '16px' }}>
                        Nastavení výzvy (Challenge)
                      </div>

                      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                        <div style={{ flex: 1.2 }}>
                          <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>Název výzvy</label>
                          <input 
                            type="text"
                            value={challenge.title || ''}
                            onChange={(e) => setChallenge({ ...challenge, title: e.target.value })}
                            style={{ width: '100%', height: '42px', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '10px', padding: '0 12px', color: '#fff', fontFamily: 'Inter', fontSize: '13px' }}
                          />
                        </div>
                        <div style={{ flex: 0.8 }}>
                          <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>Typ důkazu</label>
                          <select 
                            value={challenge.proof_type || 'PHOTO'}
                            onChange={(e) => setChallenge({ ...challenge, proof_type: e.target.value })}
                            style={{ width: '100%', height: '42px', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '10px', padding: '0 10px', color: '#fff', fontFamily: 'Inter', fontSize: '13px' }}
                          >
                            <option value="PHOTO">PHOTO (Snímky/Fotky)</option>
                            <option value="TEXT">TEXT (Jen psaný popis)</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>Odměna XP</label>
                          <input 
                            type="number"
                            value={challenge.reward_xp || 0}
                            onChange={(e) => setChallenge({ ...challenge, reward_xp: parseInt(e.target.value) || 0 })}
                            style={{ width: '100%', height: '42px', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '10px', padding: '0 12px', color: '#fff', fontFamily: 'Inter', fontSize: '13px' }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>Odměna klíče</label>
                          <input 
                            type="number"
                            value={challenge.reward_keys || 0}
                            onChange={(e) => setChallenge({ ...challenge, reward_keys: parseInt(e.target.value) || 0 })}
                            style={{ width: '100%', height: '42px', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '10px', padding: '0 12px', color: '#fff', fontFamily: 'Inter', fontSize: '13px' }}
                          />
                        </div>
                        <div style={{ flex: 1.2 }}>
                          <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>Limit (sekundy)</label>
                          <input 
                            type="number"
                            value={challenge.timebox_seconds || 900}
                            onChange={(e) => setChallenge({ ...challenge, timebox_seconds: parseInt(e.target.value) || 0 })}
                            style={{ width: '100%', height: '42px', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '10px', padding: '0 12px', color: '#fff', fontFamily: 'Inter', fontSize: '13px' }}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>Popis výzvy</label>
                        <textarea 
                          value={challenge.description || ''}
                          onChange={(e) => setChallenge({ ...challenge, description: e.target.value })}
                          rows={3}
                          style={{ width: '100%', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '10px', padding: '12px', color: '#fff', fontFamily: 'Inter', fontSize: '13px', lineHeight: '1.45', resize: 'vertical' }}
                        />
                      </div>

                      <div style={{ marginBottom: '22px' }}>
                        <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>Sekce "Proč" (Motivace)</label>
                        <input 
                          type="text"
                          value={challenge.why_text || ''}
                          onChange={(e) => setChallenge({ ...challenge, why_text: e.target.value })}
                          style={{ width: '100%', height: '42px', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '10px', padding: '0 12px', color: '#fff', fontFamily: 'Inter', fontSize: '13px' }}
                        />
                      </div>

                      {/* Steps list */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontFamily: 'Inter', fontWeight: '700', fontSize: '12px', color: '#6B6B8A', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                            Kroky plnění výzvy (Instrukce)
                          </span>
                          <button 
                            onClick={() => setSteps([...steps, { text: 'Instrukce kroku...' }])}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'rgba(124,58,237,.15)',
                              border: '1px solid #7C3AED',
                              borderRadius: '8px',
                              color: '#A78BFA',
                              padding: '4px 10px',
                              fontFamily: 'Inter',
                              fontWeight: '600',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            <Plus size={12} /> Přidat krok
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {steps.map((step, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: '#1C1630',
                                color: '#A78BFA',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '11px',
                                fontWeight: '700',
                                flexShrink: 0
                              }}>
                                {idx + 1}
                              </span>
                              <input 
                                type="text"
                                value={step.text || ''}
                                onChange={(e) => {
                                  const updated = [...steps];
                                  updated[idx].text = e.target.value;
                                  setSteps(updated);
                                }}
                                style={{ flex: 1, height: '36px', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '8px', padding: '0 10px', color: '#fff', fontFamily: 'Inter', fontSize: '12px' }}
                              />
                              <button 
                                onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  background: 'rgba(239,68,68,.1)',
                                  border: '1px solid rgba(239,68,68,.3)',
                                  borderRadius: '8px',
                                  color: '#EF4444',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6B6B8A', gap: '10px' }}>
                  <Layers size={36} />
                  <div style={{ fontFamily: 'Inter', fontSize: '13px' }}>Vyber uzel ze seznamu vlevo k úpravě.</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ==================================================== */}
        {/* TAB 2: PLAYERS MANAGEMENT VIEW                       */}
        {/* ==================================================== */}
        {activeTab === 'players' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* List and Table area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '12px', color: '#6B6B8A' }}><Search size={16} /></span>
                  <input 
                    type="text"
                    placeholder="Vyhledat hráče podle jména nebo e-mailu..."
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    style={{
                      width: '100%',
                      height: '40px',
                      background: '#15111E',
                      border: '1px solid #1B1430',
                      borderRadius: '10px',
                      padding: '0 12px 0 38px',
                      color: '#fff',
                      fontFamily: 'Inter',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ color: '#6B6B8A', fontSize: '13px' }}>
                  Nalezeno: <span style={{ color: '#fff', fontWeight: '600' }}>{filteredPlayers.length}</span> hráčů
                </div>
              </div>

              {/* Table rendering */}
              <div style={{ background: '#15111E', border: '1px solid #1B1430', borderRadius: '16px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'Inter', fontSize: '13.5px' }}>
                  <thead>
                    <tr style={{ background: '#0A0712', borderBottom: '1px solid #1B1430', color: '#6B6B8A' }}>
                      <th style={{ padding: '14px 20px' }}>Přezdívka</th>
                      <th style={{ padding: '14px 20px' }}>E-mail</th>
                      <th style={{ padding: '14px 20px', textAlign: 'center' }}>Uzel</th>
                      <th style={{ padding: '14px 20px', textAlign: 'center' }}>XP</th>
                      <th style={{ padding: '14px 20px', textAlign: 'center' }}>Klíče</th>
                      <th style={{ padding: '14px 20px', textAlign: 'center' }}>Pass Holder</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right' }}>Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.map((player) => (
                      <tr key={player.id} style={{ borderBottom: '1px solid #130F24', color: '#F0F0F8', transition: 'background 0.2s', hover: { background: 'rgba(255,255,255,0.02)' } }}>
                        <td style={{ padding: '14px 20px', fontWeight: '600' }}>
                          {player.display_name}
                          {player.is_admin && <span style={{ marginLeft: '8px', fontSize: '10px', background: '#3B82F6', color: '#fff', padding: '2px 6px', borderRadius: '6px' }}>ADMIN</span>}
                        </td>
                        <td style={{ padding: '14px 20px', color: '#9A9AB5' }}>{player.email || 'Nezadáno'}</td>
                        <td style={{ padding: '14px 20px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" }}>{player.uzel || 0}</td>
                        <td style={{ padding: '14px 20px', textAlign: 'center', color: '#F5B73F', fontWeight: '600' }}>{player.xp}</td>
                        <td style={{ padding: '14px 20px', textAlign: 'center', color: '#A78BFA', fontWeight: '600' }}>{player.keys_balance}</td>
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          {player.pass_holder ? (
                            <span style={{ color: '#22C55E', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600' }}><CheckCircle size={13} /> ANO</span>
                          ) : (
                            <span style={{ color: '#EF4444', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600' }}><ShieldX size={13} /> NE</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                          <button 
                            onClick={() => handleSelectPlayer(player)}
                            style={{
                              background: '#1C1630',
                              border: '1px solid #382C5C',
                              borderRadius: '8px',
                              color: '#A78BFA',
                              padding: '5px 12px',
                              cursor: 'pointer',
                              fontFamily: 'Inter',
                              fontWeight: '600',
                              fontSize: '12px'
                            }}
                          >
                            Upravit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Edit player Side Panel (visible when player is selected) */}
            {selectedPlayer && (
              <div style={{
                width: '320px',
                borderLeft: '1px solid #1B1430',
                background: '#090611',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                flexShrink: 0
              }}>
                <div>
                  <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', letterSpacing: '.08em' }}>Editace hráče</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '18px', fontWeight: '700', color: '#fff', marginTop: '6px' }}>{selectedPlayer.display_name}</div>
                </div>

                <div>
                  <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>Zkušenostní body (XP)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: '#F5B73F' }}><Award size={18} /></span>
                    <input 
                      type="number"
                      value={editXpValue}
                      onChange={(e) => setEditXpValue(parseInt(e.target.value) || 0)}
                      style={{ width: '100%', height: '38px', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '8px', padding: '0 10px', color: '#fff', fontFamily: 'Inter', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', marginBottom: '6px' }}>Zůstatek klíčů</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: '#A78BFA' }}><KeyRound size={18} /></span>
                    <input 
                      type="number"
                      value={editKeysValue}
                      onChange={(e) => setEditKeysValue(parseInt(e.target.value) || 0)}
                      style={{ width: '100%', height: '38px', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '8px', padding: '0 10px', color: '#fff', fontFamily: 'Inter', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5' }}>
                    <input 
                      type="checkbox"
                      checked={selectedPlayer.pass_holder || false}
                      onChange={(e) => setSelectedPlayer({ ...selectedPlayer, pass_holder: e.target.checked })}
                    />
                    Aktivní HRA PASS 🎫
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5' }}>
                    <input 
                      type="checkbox"
                      checked={selectedPlayer.is_admin || false}
                      onChange={(e) => setSelectedPlayer({ ...selectedPlayer, is_admin: e.target.checked })}
                    />
                    Administrátor systému 🛠️
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                  <button 
                    onClick={() => setSelectedPlayer(null)}
                    style={{
                      flex: 1,
                      height: '38px',
                      background: 'transparent',
                      border: '1px solid #382C5C',
                      borderRadius: '8px',
                      color: '#6B6B8A',
                      fontFamily: 'Inter',
                      fontWeight: '600',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Zrušit
                  </button>
                  <button 
                    onClick={handleSavePlayer}
                    disabled={saving}
                    style={{
                      flex: 1.5,
                      height: '38px',
                      background: '#7C3AED',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontFamily: 'Inter',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    {saving ? 'Ukládám...' : 'Uložit hráče'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: PROOF FEED MODERATION VIEW                   */}
        {/* ==================================================== */}
        {activeTab === 'moderation' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                <span style={{ position: 'absolute', left: '12px', top: '12px', color: '#6B6B8A' }}><Search size={16} /></span>
                <input 
                  type="text"
                  placeholder="Vyhledat v obsahu důkazů..."
                  value={postSearch}
                  onChange={(e) => setPostSearch(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    background: '#15111E',
                    border: '1px solid #1B1430',
                    borderRadius: '10px',
                    padding: '0 12px 0 38px',
                    color: '#fff',
                    fontFamily: 'Inter',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
              </div>
              <div style={{ color: '#6B6B8A', fontSize: '13px' }}>
                Celkem důkazů: <span style={{ color: '#fff', fontWeight: '600' }}>{filteredPosts.length}</span>
              </div>
            </div>

            {/* Posts Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {filteredPosts.map((post) => (
                <div 
                  key={post.id}
                  style={{
                    background: '#15111E',
                    border: '1px solid #1B1430',
                    borderRadius: '14px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '140px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontFamily: 'Inter', fontWeight: '700', fontSize: '14px', color: '#fff' }}>{post.user_name}</span>
                      <span style={{ fontSize: '11px', color: '#6B6B8A' }}>
                        {new Date(post.created_at).toLocaleDateString('cs-CZ')}
                      </span>
                    </div>
                    <p style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', lineHeight: '1.5', margin: '0 0 16px 0' }}>
                      {post.content}
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5px solid #1B1430', paddingTop: '12px' }}>
                    <button 
                      onClick={() => handleTogglePostPublic(post)}
                      style={{
                        background: post.is_public ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
                        border: 'none',
                        borderRadius: '8px',
                        color: post.is_public ? '#22C55E' : '#EF4444',
                        padding: '6px 12px',
                        fontFamily: 'Inter',
                        fontWeight: '600',
                        fontSize: '11.5px',
                        cursor: 'pointer'
                      }}
                    >
                      {post.is_public ? '🟢 Veřejný' : '🔒 Soukromý'}
                    </button>

                    <button 
                      onClick={() => handleDeletePost(post.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#EF4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontFamily: 'Inter',
                        fontWeight: '600',
                        fontSize: '11.5px'
                      }}
                    >
                      <Trash2 size={13} /> Smazat
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
