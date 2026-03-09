import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2, PawPrint, Plus, ArrowRight, Loader2 } from 'lucide-react';

function calcAge(dob) {
  if (!dob) return '';
  const birth = new Date(dob);
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 24) return `${months} month${months !== 1 ? 's' : ''} old`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} old`;
}

export default function ParentOnboarding() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);

  // Household state
  const [household, setHousehold] = useState(null);
  const [hhNickname, setHhNickname] = useState('My Home');
  const [hhZip, setHhZip] = useState('');
  const [hhHasPets, setHhHasPets] = useState(false);

  // Children state
  const [children, setChildren] = useState([]);
  const [newChild, setNewChild] = useState({ first_name: '', date_of_birth: '', allergies: '', notes: '', special_needs_flag: false });
  const [addingChild, setAddingChild] = useState(false);
  const [savingChild, setSavingChild] = useState(false);

  // Pets state
  const [pets, setPets] = useState([]);
  const [newPet, setNewPet] = useState({ pet_type: '', pet_size: '', pet_temperament: '', pet_name: '', additional_notes: '' });
  const [addingPet, setAddingPet] = useState(false);
  const [savingPet, setSavingPet] = useState(false);

  // Address state
  const [address, setAddress] = useState({ street_address: '', city: '', state: '', zip_code: '', special_instructions: '' });

  useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me();
        setUser(u);
        if (!u || u.app_role !== 'parent') { navigate(createPageUrl('Home')); return; }
        if (u.onboarding_complete) { navigate(createPageUrl('ParentDashboard')); return; }

        const res = await base44.functions.invoke('getParentHousehold');
        const { household: hh = null, children: c = [], pets: p = [] } = res.data;
        if (hh) {
          setHousehold(hh);
          setHhNickname(hh.nickname || 'My Home');
          setHhZip(hh.zip_code || '');
          setHhHasPets(hh.has_pets || false);
          setAddress({
            street_address: hh.street_address || '',
            city: hh.city || '',
            state: hh.state || '',
            zip_code: hh.zip_code || '',
            special_instructions: hh.special_instructions || ''
          });
        }
        setChildren(c);
        setPets(p);
      } catch (e) {
        setError(e.message || 'Failed to load your profile. Please refresh.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addChild = async () => {
    setError('');
    if (!newChild.first_name.trim()) { setError("Please enter the child's name."); return; }
    if (!newChild.date_of_birth) { setError('Please enter date of birth.'); return; }
    setSavingChild(true);
    try {
      const res = await base44.functions.invoke('manageChild', { action: 'create', household_id: household?.id, ...newChild });
      if (res.data?.error) { setError(res.data.error); return; }
      setChildren(prev => [...prev, res.data.child]);
      setNewChild({ first_name: '', date_of_birth: '', allergies: '', notes: '', special_needs_flag: false });
      setAddingChild(false);
    } catch (e) {
      setError(e.message || 'Failed to add child.');
    } finally {
      setSavingChild(false);
    }
  };

  const addPet = async () => {
    setError('');
    if (!newPet.pet_type || !newPet.pet_size || !newPet.pet_temperament) { setError('Please fill in all required pet fields.'); return; }
    setSavingPet(true);
    try {
      const res = await base44.functions.invoke('managePet', { action: 'create', household_id: household?.id, ...newPet });
      if (res.data?.error) { setError(res.data.error); return; }
      setPets(prev => [...prev, res.data.pet]);
      setNewPet({ pet_type: '', pet_size: '', pet_temperament: '', pet_name: '', additional_notes: '' });
      setAddingPet(false);
    } catch (e) {
      setError(e.message || 'Failed to add pet.');
    } finally {
      setSavingPet(false);
    }
  };

  const handleComplete = async () => {
    setError('');
    if (children.length === 0) { setError('Please add at least one child.'); return; }
    if (!address.street_address || !address.city || !address.state) {
      setError('Street address, city, and state are required.'); return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('manageHousehold', {
        action: household?.id ? 'update' : 'create',
        household_id: household?.id,
        nickname: hhNickname,
        zip_code: hhZip,
        has_pets: hhHasPets,
        ...address
      });
      if (res.data?.error) { setError(res.data.error); return; }
      if (!household?.id && (res.data?.household || res.data?.id)) {
        setHousehold(res.data.household ?? res.data);
      }
      await base44.auth.updateMe({ onboarding_complete: true });
      setCompleted(true);
    } catch (e) {
      setError(e.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#C36239]" />
    </div>
  );

  if (completed) return (
    <div className="min-h-screen bg-[#FEFEFE] flex flex-col items-center justify-center px-4">
      <CheckCircle2 className="w-20 h-20 text-[#2D6A4F] mb-4" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h2>
      <p className="text-gray-500 mb-8">Your profile is complete. You can now browse and book caregivers.</p>
      <Button onClick={() => navigate(createPageUrl('ParentDashboard'))} className="bg-[#C36239] hover:bg-[#A0522D] text-white px-8">
        Go to Dashboard <ArrowRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FEFEFE] flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Set up your profile</h1>
          <p className="text-gray-500 mt-1">Tell us about your household so you can start booking care.</p>
        </div>

        {error && <p className="mb-6 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="space-y-8">

          {/* Section: Household */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Your Household</h2>
            <div>
              <Label>Household nickname</Label>
              <Input value={hhNickname} onChange={e => setHhNickname(e.target.value)} placeholder="e.g. My Home, Dad's House" className="mt-1" />
            </div>
            <div>
              <Label>Zip code</Label>
              <Input value={hhZip} onChange={e => setHhZip(e.target.value)} placeholder="12345" className="mt-1" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={hhHasPets} onCheckedChange={setHhHasPets} />
              <Label>This household has pets</Label>
            </div>
          </div>

          {/* Section: Children */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Children</h2>
            <p className="text-sm text-gray-500">Add at least one child to continue.</p>

            {children.length > 0 && (
              <div className="space-y-2">
                {children.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-[#F9F7F4] rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-[#C36239]/20 flex items-center justify-center text-[#C36239] font-bold text-sm">{c.first_name[0]}</div>
                    <div>
                      <p className="font-medium text-gray-900">{c.first_name}</p>
                      <p className="text-xs text-gray-500">{calcAge(c.date_of_birth)}</p>
                    </div>
                    {c.allergies && <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Allergies</span>}
                  </div>
                ))}
              </div>
            )}

            {addingChild ? (
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div><Label>First name / nickname *</Label><Input value={newChild.first_name} onChange={e => setNewChild(p => ({ ...p, first_name: e.target.value }))} className="mt-1" /></div>
                <div>
                  <Label>Date of birth *</Label>
                  <Input type="date" value={newChild.date_of_birth} max={new Date().toISOString().split('T')[0]} onChange={e => setNewChild(p => ({ ...p, date_of_birth: e.target.value }))} className="mt-1" />
                  {newChild.date_of_birth && <p className="text-xs text-gray-500 mt-1">{calcAge(newChild.date_of_birth)}</p>}
                </div>
                <div><Label>Allergies (optional)</Label><Input value={newChild.allergies} onChange={e => setNewChild(p => ({ ...p, allergies: e.target.value }))} className="mt-1" /></div>
                <div><Label>Notes (optional)</Label><Input value={newChild.notes} onChange={e => setNewChild(p => ({ ...p, notes: e.target.value }))} className="mt-1" /></div>
                <div className="flex items-center gap-2"><Switch checked={newChild.special_needs_flag} onCheckedChange={v => setNewChild(p => ({ ...p, special_needs_flag: v }))} /><Label>Special care needs</Label></div>
                <div className="flex gap-2">
                  <Button onClick={addChild} disabled={savingChild} className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white">{savingChild ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Child'}</Button>
                  <Button variant="outline" onClick={() => setAddingChild(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingChild(true)} className="flex items-center gap-2 text-sm text-[#C36239] font-medium hover:underline">
                <Plus className="w-4 h-4" /> Add a child
              </button>
            )}
          </div>

          {/* Section: Pets (conditional) */}
          {hhHasPets && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Pets</h2>
              <p className="text-sm text-gray-500">Tell us about your pets so caregivers are prepared.</p>

              {pets.length > 0 && (
                <div className="space-y-2">
                  {pets.map(p => (
                    <div key={p.id} className="flex items-center gap-3 p-3 bg-[#F9F7F4] rounded-lg">
                      <PawPrint className="w-5 h-5 text-[#C36239]" />
                      <div>
                        <p className="font-medium text-gray-900">{p.pet_name || p.pet_type}</p>
                        <p className="text-xs text-gray-500">{p.pet_size} · {p.pet_temperament}</p>
                      </div>
                      {p.pet_temperament === 'Aggressive - Needs Management' && (
                        <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠ Needs Management</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {addingPet ? (
                <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <div><Label>Pet name (optional)</Label><Input value={newPet.pet_name} onChange={e => setNewPet(p => ({ ...p, pet_name: e.target.value }))} className="mt-1" /></div>
                  <div>
                    <Label>Pet type *</Label>
                    <select value={newPet.pet_type} onChange={e => setNewPet(p => ({ ...p, pet_type: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mt-1">
                      <option value="">Select type</option>
                      {['Dog','Cat','Bird','Reptile','Small Animal','Other'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Size *</Label>
                    <select value={newPet.pet_size} onChange={e => setNewPet(p => ({ ...p, pet_size: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mt-1">
                      <option value="">Select size</option>
                      {['Small (0-15 lbs)','Medium (16-40 lbs)','Large (41-80 lbs)','Extra Large (80+ lbs)'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Temperament *</Label>
                    <select value={newPet.pet_temperament} onChange={e => setNewPet(p => ({ ...p, pet_temperament: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mt-1">
                      <option value="">Select temperament</option>
                      {['Very Friendly','Friendly','Neutral','Shy','Not Friendly With Strangers','Aggressive - Needs Management'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><Label>Additional notes (optional)</Label><Input value={newPet.additional_notes} onChange={e => setNewPet(p => ({ ...p, additional_notes: e.target.value }))} className="mt-1" /></div>
                  <div className="flex gap-2">
                    <Button onClick={addPet} disabled={savingPet} className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white">{savingPet ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Pet'}</Button>
                    <Button variant="outline" onClick={() => setAddingPet(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingPet(true)} className="flex items-center gap-2 text-sm text-[#C36239] font-medium hover:underline">
                  <Plus className="w-4 h-4" /> Add a pet
                </button>
              )}
            </div>
          )}

          {/* Section: Address */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Where will care take place?</h2>
            <p className="text-sm text-gray-500">Your full address is shared with a caregiver only after they accept your booking.</p>
            <div><Label>Street address *</Label><Input value={address.street_address} onChange={e => setAddress(p => ({ ...p, street_address: e.target.value }))} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>City *</Label><Input value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} className="mt-1" /></div>
              <div><Label>State *</Label><Input value={address.state} onChange={e => setAddress(p => ({ ...p, state: e.target.value }))} placeholder="e.g. NY" className="mt-1" /></div>
            </div>
            <div><Label>Zip code</Label><Input value={address.zip_code} onChange={e => setAddress(p => ({ ...p, zip_code: e.target.value }))} className="mt-1" /></div>
            <div><Label>Special instructions (optional)</Label><Input value={address.special_instructions} onChange={e => setAddress(p => ({ ...p, special_instructions: e.target.value }))} placeholder="e.g. Ring doorbell twice" className="mt-1" /></div>
          </div>

          <Button onClick={handleComplete} disabled={saving} className="w-full bg-[#C36239] hover:bg-[#A0522D] text-white py-3 text-base">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Complete Setup & Find Caregivers 🎉'}
          </Button>

        </div>
      </div>
    </div>
  );
}