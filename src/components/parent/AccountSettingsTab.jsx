import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast as sonnerToast } from 'sonner';
import {
  ChevronDown, ChevronUp, Plus, Pencil, Trash2, CheckCircle2,
  AlertTriangle, PawPrint, Users, MapPin, Loader2, Home,
  Upload, X, User, AlertCircle
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcAge(dob) {
  if (!dob) return '';
  const birth = new Date(dob);
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 24) return `${months}mo old`;
  return `${Math.floor(months / 12)} years old`;
}

function getInitials(user) {
  const name = user?.full_name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  return user?.email?.[0]?.toUpperCase() ?? '?';
}

function getDisplayName(user) {
  const name = user?.full_name?.trim();
  if (name) return name;
  return user?.email?.split('@')[0] ?? 'there';
}

const showToast = (msg, type = 'success') => {
  type === 'error' ? sonnerToast.error(msg) : sonnerToast.success(msg);
};

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// ─── PetIcon ──────────────────────────────────────────────────────────────────
function PetIcon({ type }) {
  if (type === 'Dog') return <span>🐕</span>;
  if (type === 'Cat') return <span>🐈</span>;
  if (type === 'Bird') return <span>🐦</span>;
  if (type === 'Reptile') return <span>🦎</span>;
  return <PawPrint className="w-4 h-4" />;
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value || <span className="text-gray-300 italic">Not set</span>}</p>
    </div>
  );
}

// ─── AvatarUpload ─────────────────────────────────────────────────────────────
function AvatarUpload({ user, onSave }) {
  const [preview, setPreview] = useState(user?.profile_photo_url ?? null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      showToast('Please upload a JPG, PNG, GIF, or WebP image.', 'error'); return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      showToast('Photo must be under 5 MB.', 'error'); return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(file);
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPreview(file_url);
      await onSave({ profile_photo_url: file_url });
      showToast('Photo updated');
    } catch (err) {
      setPreview(user?.profile_photo_url ?? null);
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    try {
      await onSave({ profile_photo_url: null });
      setPreview(null);
      showToast('Photo removed');
    } catch (err) {
      showToast(err.message || 'Failed to remove photo', 'error');
    }
  };

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        {preview ? (
          <img src={preview} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-[#E5E2DC]" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-[#C36239]/15 border-2 border-[#E5E2DC] flex items-center justify-center text-[#C36239] text-2xl font-bold select-none">
            {getInitials(user)}
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading} className="text-sm">
          <Upload className="w-3.5 h-3.5 mr-2" />
          {preview ? 'Change photo' : 'Upload photo'}
        </Button>
        {preview && (
          <Button variant="ghost" size="sm" onClick={remove} disabled={uploading} className="text-sm text-gray-500 hover:text-red-500">
            <X className="w-3.5 h-3.5 mr-2" /> Remove
          </Button>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleFile} />
      </div>
    </div>
  );
}

// ─── ProfileHeader ────────────────────────────────────────────────────────────
function ProfileHeader({ user, onUserUpdate }) {
  const handleSave = async (patch) => {
    await base44.auth.updateMe(patch);
    onUserUpdate(patch);
  };
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-6">
        <AvatarUpload user={user} onSave={handleSave} />
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Welcome back</p>
          <h2 className="text-2xl font-bold text-[#0C2119]">Hi, {getDisplayName(user)}</h2>
          {user?.email && <p className="text-sm text-gray-400 mt-0.5">{user.email}</p>}
        </div>
      </div>
    </section>
  );
}

// ─── PersonalInfoSection ──────────────────────────────────────────────────────
function PersonalInfoSection({ user, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    email:     user?.email     || '',
    phone:     user?.phone     || '',
    zip_code:  user?.zip_code  || '',
  });
  const [saved, setSaved] = useState({ ...form });
  const [saving, setSaving] = useState(false);
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ phone: form.phone, zip_code: form.zip_code });
      setSaved({ ...form });
      onUpdate?.(form);
      setEditing(false);
      showToast('Personal info saved');
    } catch (e) {
      showToast(e.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => { setForm({ ...saved }); setEditing(false); };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <User className="w-4 h-4 text-[#C36239]" /> Personal Info
        </h3>
        {!editing && (
          <Button onClick={() => setEditing(true)} variant="outline" className="h-8 text-sm">
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
          </Button>
        )}
      </div>
      {editing ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow label="Full name" value={form.full_name} />
            <InfoRow label="Email"     value={form.email} />
            <div><Label>Phone</Label><Input value={form.phone} onChange={f('phone')} placeholder="+1 (555) 000-0000" /></div>
            <div><Label>Default zip code</Label><Input value={form.zip_code} onChange={f('zip_code')} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={cancel} className="text-sm">Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-[#C36239] hover:bg-[#A0522D] text-white text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Full name"   value={saved.full_name} />
          <InfoRow label="Email"       value={saved.email} />
          <InfoRow label="Phone"       value={saved.phone} />
          <InfoRow label="Default zip" value={saved.zip_code} />
        </div>
      )}
    </section>
  );
}

// ─── AddressSection ───────────────────────────────────────────────────────────
function AddressSection({ hh, onSave, saving, errors }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    street_address:       hh.street_address       || '',
    city:                 hh.city                 || '',
    state:                hh.state                || '',
    zip_code:             hh.zip_code             || '',
    special_instructions: hh.special_instructions || '',
  });
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    setForm({
      street_address:       hh.street_address       || '',
      city:                 hh.city                 || '',
      state:                hh.state                || '',
      zip_code:             hh.zip_code             || '',
      special_instructions: hh.special_instructions || '',
    });
  }, [hh]);

  const cancel = () => {
    setForm({
      street_address:       hh.street_address       || '',
      city:                 hh.city                 || '',
      state:                hh.state                || '',
      zip_code:             hh.zip_code             || '',
      special_instructions: hh.special_instructions || '',
    });
    setEditing(false);
  };

  const handleSave = async () => {
    const ok = await onSave(hh, form);
    if (ok) setEditing(false);
  };

  const hasAddress = hh.street_address && hh.city && hh.state;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-800 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#C36239]" /> Address
        </h4>
        {!editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-[#C36239] hover:underline font-medium">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <Label>Street address *</Label>
            <Input value={form.street_address} onChange={f('street_address')} />
            {errors[`addr-${hh.id}-street`] && <p className="text-xs text-red-500 mt-1">{errors[`addr-${hh.id}-street`]}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>City *</Label>
              <Input value={form.city} onChange={f('city')} />
              {errors[`addr-${hh.id}-city`] && <p className="text-xs text-red-500 mt-1">{errors[`addr-${hh.id}-city`]}</p>}
            </div>
            <div>
              <Label>State *</Label>
              <Input value={form.state} onChange={f('state')} placeholder="NY" />
              {errors[`addr-${hh.id}-state`] && <p className="text-xs text-red-500 mt-1">{errors[`addr-${hh.id}-state`]}</p>}
            </div>
          </div>
          <div><Label>Zip code</Label><Input value={form.zip_code} onChange={f('zip_code')} /></div>
          <div><Label>Special instructions</Label><Input value={form.special_instructions} onChange={f('special_instructions')} placeholder="e.g. Ring doorbell twice" /></div>
          {errors[`addr-${hh.id}`] && <p className="text-xs text-red-500 mt-1">{errors[`addr-${hh.id}`]}</p>}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={cancel} className="text-sm">Cancel</Button>
            <Button onClick={handleSave} disabled={saving === `addr-${hh.id}`} className="bg-[#C36239] hover:bg-[#A0522D] text-white text-sm">
              {saving === `addr-${hh.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save address'}
            </Button>
          </div>
        </div>
      ) : hasAddress ? (
        <div className="text-sm text-gray-700 space-y-0.5">
          <p>{hh.street_address}</p>
          <p>{hh.city}, {hh.state} {hh.zip_code}</p>
          {hh.special_instructions && (
            <p className="text-gray-400 text-xs mt-1 italic">"{hh.special_instructions}"</p>
          )}
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="text-sm text-amber-600 hover:underline flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> Add address (required before booking)
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AccountSettingsTab({ user: userProp }) {
  const [localUser, setLocalUser] = useState(userProp);
  const user = localUser;
  const handleUserUpdate = useCallback(
    (patch) => setLocalUser(prev => ({ ...prev, ...patch })),
    []
  );

  const [households, setHouseholds] = useState([]);
  const [children, setChildren] = useState([]);
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedHH, setExpandedHH] = useState(null);
  const [saving, setSaving] = useState('');
  const [errors, setErrors] = useState({});

  const [showAddHH, setShowAddHH] = useState(false);
  const [newHH, setNewHH] = useState({ nickname: '', zip_code: '', has_pets: false });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const res = await base44.functions.invoke('getParentHousehold');
    const { households: hhs = [], children: c = [], pets: p = [] } = res.data;
    setHouseholds(hhs);
    setChildren(c);
    setPets(p);
    if (hhs.length > 0 && !expandedHH) setExpandedHH(hhs[0].id);
    setLoading(false);
  }

  const setFieldError = (key, msg) => setErrors(prev => ({ ...prev, [key]: msg }));
  const clearError = (key) => setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });

  const saveAddress = async (hh, addressData) => {
    setSaving(`addr-${hh.id}`);
    setErrors({});
    if (!addressData.street_address) { setFieldError(`addr-${hh.id}-street`, 'Street address is required.'); setSaving(''); return false; }
    if (!addressData.city)           { setFieldError(`addr-${hh.id}-city`,   'City is required.');           setSaving(''); return false; }
    if (!addressData.state)          { setFieldError(`addr-${hh.id}-state`,  'State is required.');          setSaving(''); return false; }
    const res = await base44.functions.invoke('manageHousehold', { action: 'update', household_id: hh.id, ...addressData });
    setSaving('');
    if (res.data?.error) { setFieldError(`addr-${hh.id}`, res.data.error); return false; }
    await loadData();
    return true;
  };

  const saveHHSettings = async (hh, data) => {
    setSaving(`hh-${hh.id}`);
    const res = await base44.functions.invoke('manageHousehold', { action: 'update', household_id: hh.id, ...data });
    setSaving('');
    if (res.data?.error) { setFieldError(`hh-${hh.id}`, res.data.error); return; }
    await loadData();
  };

  const deleteHousehold = async (hh) => {
    const res = await base44.functions.invoke('manageHousehold', { action: 'delete', household_id: hh.id });
    if (res.data?.error) { setFieldError(`hh-del-${hh.id}`, res.data.error); return; }
    await loadData();
  };

  const addChildToHH = async (hhId, childData) => {
    setSaving(`child-add-${hhId}`);
    setErrors({});
    const res = await base44.functions.invoke('manageChild', { action: 'create', household_id: hhId, ...childData });
    setSaving('');
    if (res.data?.error) { setFieldError(`child-add-${hhId}`, res.data.error); return null; }
    await loadData();
    return true;
  };

  const deleteChild = async (childId) => {
    const res = await base44.functions.invoke('manageChild', { action: 'delete', child_id: childId });
    if (res.data?.error) { setFieldError(`child-del-${childId}`, res.data.error); return; }
    await loadData();
  };

  const editChild = async (childId, childData, onSuccess) => {
    setSaving(`child-edit-${childId}`);
    const res = await base44.functions.invoke('manageChild', { action: 'update', child_id: childId, ...childData });
    setSaving('');
    if (res.data?.error) { setFieldError(`child-edit-${childId}`, res.data.error); return; }
    onSuccess?.();
    await loadData();
  };

  const addPetToHH = async (hhId, petData) => {
    setSaving(`pet-add-${hhId}`);
    const res = await base44.functions.invoke('managePet', { action: 'create', household_id: hhId, ...petData });
    setSaving('');
    if (res.data?.error) { setFieldError(`pet-add-${hhId}`, res.data.error); return null; }
    await loadData();
    return true;
  };

  const deletePet = async (petId) => {
    const res = await base44.functions.invoke('managePet', { action: 'delete', pet_id: petId });
    if (res.data?.error) { setFieldError(`pet-del-${petId}`, res.data.error); return; }
    await loadData();
  };

  const addHousehold = async () => {
    if (!newHH.zip_code) { setFieldError('new-hh-zip', 'Zip code is required.'); return; }
    setSaving('new-hh');
    const res = await base44.functions.invoke('manageHousehold', { action: 'create', ...newHH });
    setSaving('');
    if (res.data?.error) { setFieldError('new-hh', res.data.error); return; }
    setShowAddHH(false);
    setNewHH({ nickname: '', zip_code: '', has_pets: false });
    await loadData();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C36239]" /></div>;

  return (
    <div className="space-y-6">
      {/* Incomplete profile banner */}
      {!user?.onboarding_complete && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">Your profile is incomplete. Complete your profile to start booking.</p>
          <a href={createPageUrl('ParentOnboarding')} className="ml-auto text-sm font-medium text-amber-700 underline">Resume</a>
        </div>
      )}

      {/* Profile Header with Avatar */}
      <ProfileHeader user={user} onUserUpdate={handleUserUpdate} />

      {/* Personal Info — view/edit toggle */}
      <PersonalInfoSection user={user} onUpdate={handleUserUpdate} />

      {/* Households */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Households</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddHH(true)}
            disabled={households.length >= 5}
            title={households.length >= 5 ? 'Maximum 5 households reached' : ''}
            className="text-[#C36239] border-[#C36239] hover:bg-[#C36239]/10"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Household
          </Button>
        </div>

        {showAddHH && (
          <div className="mb-4 border border-dashed border-gray-300 rounded-xl p-4 space-y-3">
            <div><Label>Nickname</Label><Input value={newHH.nickname} onChange={e => setNewHH(p => ({ ...p, nickname: e.target.value }))} placeholder="e.g. My Home" /></div>
            <div>
              <Label>Zip code *</Label>
              <Input value={newHH.zip_code} onChange={e => setNewHH(p => ({ ...p, zip_code: e.target.value }))} />
              {errors['new-hh-zip'] && <p className="text-xs text-red-500 mt-1">{errors['new-hh-zip']}</p>}
            </div>
            <div className="flex items-center gap-2"><Switch checked={newHH.has_pets} onCheckedChange={v => setNewHH(p => ({ ...p, has_pets: v }))} /><Label>Has pets</Label></div>
            {errors['new-hh'] && <p className="text-xs text-red-500">{errors['new-hh']}</p>}
            <div className="flex gap-2">
              <Button onClick={addHousehold} disabled={saving === 'new-hh'} className="bg-[#2D6A4F] text-white">
                {saving === 'new-hh' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Household'}
              </Button>
              <Button variant="outline" onClick={() => setShowAddHH(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {households.map(hh => (
            <HouseholdCard
              key={hh.id}
              hh={hh}
              children={children.filter(c => c.household_id === hh.id)}
              pets={pets.filter(p => p.household_id === hh.id)}
              expanded={expandedHH === hh.id}
              onToggle={() => setExpandedHH(expandedHH === hh.id ? null : hh.id)}
              saving={saving}
              errors={errors}
              onSaveAddress={saveAddress}
              onSaveSettings={saveHHSettings}
              onDeleteHH={deleteHousehold}
              onAddChild={addChildToHH}
              onDeleteChild={deleteChild}
              onEditChild={editChild}
              onAddPet={addPetToHH}
              onDeletePet={deletePet}
              clearError={clearError}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── HouseholdCard ────────────────────────────────────────────────────────────
function HouseholdCard({ hh, children, pets, expanded, onToggle, saving, errors, onSaveAddress, onSaveSettings, onDeleteHH, onAddChild, onDeleteChild, onEditChild, onAddPet, onDeletePet, clearError }) {
  const [hasPets, setHasPets] = useState(hh.has_pets);
  const [addingChild, setAddingChild] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const [editChildForm, setEditChildForm] = useState({});
  const [newChild, setNewChild] = useState({ first_name: '', date_of_birth: '', allergies: '', notes: '', special_needs_flag: false });

  const startEditChild = (c) => {
    setEditingChild(c.id);
    setEditChildForm({
      first_name:         c.first_name         || '',
      date_of_birth:      c.date_of_birth      || '',
      allergies:          c.allergies          || '',
      notes:              c.notes              || '',
      special_needs_flag: c.special_needs_flag || false,
    });
  };
  const [addingPet, setAddingPet] = useState(false);
  const [newPet, setNewPet] = useState({ pet_type: '', pet_size: '', pet_temperament: '', pet_name: '', additional_notes: '' });

  const isAddressComplete = hh.street_address && hh.city && hh.state;

  const handleAddChild = async () => {
    const ok = await onAddChild(hh.id, newChild);
    if (ok) { setAddingChild(false); setNewChild({ first_name: '', date_of_birth: '', allergies: '', notes: '', special_needs_flag: false }); }
  };

  const handleAddPet = async () => {
    const ok = await onAddPet(hh.id, newPet);
    if (ok) { setAddingPet(false); setNewPet({ pet_type: '', pet_size: '', pet_temperament: '', pet_name: '', additional_notes: '' }); }
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-white cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <Home className="w-5 h-5 text-gray-400" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{hh.nickname || 'Household'}</p>
          <p className="text-xs text-gray-500">{hh.zip_code}</p>
        </div>
        <div className="flex items-center gap-2">
          {hh.is_primary && <Badge className="bg-[#2D6A4F] text-white text-xs">Primary</Badge>}
          {isAddressComplete
            ? <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="w-3.5 h-3.5" />Complete</span>
            : <span className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="w-3.5 h-3.5" />Incomplete</span>}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-[#FAFAFA] p-5 space-y-6">
          {/* Address — view/edit toggle */}
          <AddressSection hh={hh} onSave={onSaveAddress} saving={saving} errors={errors} />

          {/* Pets toggle */}
          <div className="flex items-center gap-3 pb-2">
            <Switch checked={hasPets} onCheckedChange={v => { setHasPets(v); onSaveSettings(hh, { has_pets: v }); }} />
            <Label>This household has pets</Label>
          </div>

          {/* Children */}
          <div>
            <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-[#2D6A4F]" />Children</h4>
            <div className="space-y-2 mb-3">
              {children.map(c =>
                editingChild === c.id ? (
                  <div key={c.id} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white">
                    <Input value={editChildForm.first_name} onChange={e => setEditChildForm(p => ({ ...p, first_name: e.target.value }))} placeholder="Name *" />
                    <div>
                      <Input type="date" value={editChildForm.date_of_birth} max={new Date().toISOString().split('T')[0]} onChange={e => setEditChildForm(p => ({ ...p, date_of_birth: e.target.value }))} />
                      {editChildForm.date_of_birth && <p className="text-xs text-gray-500 mt-0.5">{calcAge(editChildForm.date_of_birth)}</p>}
                    </div>
                    <Input value={editChildForm.allergies} onChange={e => setEditChildForm(p => ({ ...p, allergies: e.target.value }))} placeholder="Allergies (optional)" />
                    <Input value={editChildForm.notes} onChange={e => setEditChildForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes (optional)" />
                    <div className="flex items-center gap-2">
                      <Switch checked={editChildForm.special_needs_flag} onCheckedChange={v => setEditChildForm(p => ({ ...p, special_needs_flag: v }))} />
                      <span className="text-sm">Special care needs</span>
                    </div>
                    {errors[`child-edit-${c.id}`] && <p className="text-xs text-red-500">{errors[`child-edit-${c.id}`]}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => onEditChild(c.id, editChildForm, () => setEditingChild(null))} disabled={saving === `child-edit-${c.id}`} className="bg-[#2D6A4F] text-white">
                        {saving === `child-edit-${c.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingChild(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 group">
                    <div className="w-8 h-8 rounded-full bg-[#C36239]/15 flex items-center justify-center text-[#C36239] font-bold text-sm">{c.first_name[0]}</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{c.first_name} <span className="font-normal text-gray-500">— {calcAge(c.date_of_birth)}</span></p>
                      <div className="flex gap-1 mt-0.5">
                        {c.allergies && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Allergies</span>}
                        {c.special_needs_flag && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Special needs</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100">
                      <button onClick={() => startEditChild(c)} className="text-gray-400 hover:text-[#C36239]">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => onDeleteChild(c.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
            {addingChild ? (
              <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white">
                <Input value={newChild.first_name} onChange={e => setNewChild(p => ({ ...p, first_name: e.target.value }))} placeholder="Name or nickname *" />
                <div>
                  <Input type="date" value={newChild.date_of_birth} max={new Date().toISOString().split('T')[0]} onChange={e => setNewChild(p => ({ ...p, date_of_birth: e.target.value }))} />
                  {newChild.date_of_birth && <p className="text-xs text-gray-500 mt-0.5">{calcAge(newChild.date_of_birth)}</p>}
                </div>
                <Input value={newChild.allergies} onChange={e => setNewChild(p => ({ ...p, allergies: e.target.value }))} placeholder="Allergies (optional)" />
                <Input value={newChild.notes} onChange={e => setNewChild(p => ({ ...p, notes: e.target.value }))} placeholder="Notes (optional)" />
                <div className="flex items-center gap-2"><Switch checked={newChild.special_needs_flag} onCheckedChange={v => setNewChild(p => ({ ...p, special_needs_flag: v }))} /><span className="text-sm">Special care needs</span></div>
                {errors[`child-add-${hh.id}`] && <p className="text-xs text-red-500">{errors[`child-add-${hh.id}`]}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddChild} disabled={saving === `child-add-${hh.id}`} className="bg-[#2D6A4F] text-white">
                    {saving === `child-add-${hh.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAddingChild(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingChild(true)} className="flex items-center gap-1 text-sm text-[#2D6A4F] font-medium hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add child
              </button>
            )}
          </div>

          {/* Pets (conditional) */}
          {hasPets && (
            <div>
              <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2"><PawPrint className="w-4 h-4 text-[#C36239]" />Pets</h4>
              <div className="space-y-2 mb-3">
                {pets.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 group">
                    <PetIcon type={p.pet_type} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{p.pet_name || p.pet_type} <span className="font-normal text-gray-500">· {p.pet_size}</span></p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${p.pet_temperament === 'Aggressive - Needs Management' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                        {p.pet_temperament === 'Aggressive - Needs Management' ? '⚠ ' : ''}{p.pet_temperament}
                      </span>
                    </div>
                    <button onClick={() => onDeletePet(p.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              {addingPet ? (
                <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white">
                  <Input value={newPet.pet_name} onChange={e => setNewPet(p => ({ ...p, pet_name: e.target.value }))} placeholder="Pet name (optional)" />
                  <select value={newPet.pet_type} onChange={e => setNewPet(p => ({ ...p, pet_type: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm">
                    <option value="">Pet type *</option>
                    {['Dog','Cat','Bird','Reptile','Small Animal','Other'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={newPet.pet_size} onChange={e => setNewPet(p => ({ ...p, pet_size: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm">
                    <option value="">Size *</option>
                    {['Small (0-15 lbs)','Medium (16-40 lbs)','Large (41-80 lbs)','Extra Large (80+ lbs)'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={newPet.pet_temperament} onChange={e => setNewPet(p => ({ ...p, pet_temperament: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm">
                    <option value="">Temperament *</option>
                    {['Very Friendly','Friendly','Neutral','Shy','Not Friendly With Strangers','Aggressive - Needs Management'].map(t => (
                      <option key={t} value={t} style={t === 'Aggressive - Needs Management' ? { color: '#92400e' } : {}}>{t === 'Aggressive - Needs Management' ? '⚠ ' : ''}{t}</option>
                    ))}
                  </select>
                  <Input value={newPet.additional_notes} onChange={e => setNewPet(p => ({ ...p, additional_notes: e.target.value }))} placeholder="Additional notes (optional)" />
                  {errors[`pet-add-${hh.id}`] && <p className="text-xs text-red-500">{errors[`pet-add-${hh.id}`]}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddPet} disabled={saving === `pet-add-${hh.id}`} className="bg-[#2D6A4F] text-white">
                      {saving === `pet-add-${hh.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAddingPet(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingPet(true)} className="flex items-center gap-1 text-sm text-[#2D6A4F] font-medium hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Add pet
                </button>
              )}
            </div>
          )}

          {/* Delete household */}
          <div className="pt-2 border-t border-gray-100">
            {errors[`hh-del-${hh.id}`] && <p className="text-xs text-red-500 mb-2">{errors[`hh-del-${hh.id}`]}</p>}
            <button onClick={() => onDeleteHH(hh)} className="text-xs text-red-400 hover:text-red-600 hover:underline">Remove this household</button>
          </div>
        </div>
      )}
    </div>
  );
}