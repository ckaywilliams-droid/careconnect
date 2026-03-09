import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, X, Loader2 } from 'lucide-react';

export default function ParentOnboarding() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [parent, setParent] = useState({ first_name: '', last_name: '', phone: '', has_pets: false });
  const [children, setChildren] = useState([{ first_name: '', date_of_birth: '' }]);
  const [address, setAddress] = useState({ street: '', city: '', state: '', zip: '' });

  const addChild = () => setChildren(prev => [...prev, { first_name: '', date_of_birth: '' }]);
  const removeChild = (i) => setChildren(prev => prev.filter((_, idx) => idx !== i));
  const updateChild = (i, field, value) =>
    setChildren(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));

  const handleSubmit = async () => {
    setError('');
    if (!parent.first_name || !parent.last_name || !parent.phone) {
      setError('First name, last name, and phone number are required.'); return;
    }
    if (!address.street || !address.city || !address.state || !address.zip) {
      setError('Full address is required.'); return;
    }
    if (children.length === 0) {
      setError('Please add at least one child.'); return;
    }
    for (const c of children) {
      if (!c.first_name || !c.date_of_birth) {
        setError('Each child requires a first name and date of birth.'); return;
      }
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('onboardParent', { parent, children, address });
      if (res.data?.error) { setError(res.data.error); setSaving(false); return; }
      await base44.auth.updateMe({ onboarding_complete: true });
      navigate(createPageUrl('ParentDashboard'));
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F7F4] flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-xl space-y-6">

        <div>
          <h1 className="text-3xl font-bold text-gray-900">Set up your profile</h1>
          <p className="text-gray-500 mt-1">Tell us about yourself so you can start booking care.</p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {/* Section 1: About You */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">About You</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First name *</Label>
              <Input value={parent.first_name} onChange={e => setParent(p => ({ ...p, first_name: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Last name *</Label>
              <Input value={parent.last_name} onChange={e => setParent(p => ({ ...p, last_name: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Phone number *</Label>
            <Input value={parent.phone} onChange={e => setParent(p => ({ ...p, phone: e.target.value }))} placeholder="(555) 000-0000" className="mt-1" />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={parent.has_pets} onCheckedChange={v => setParent(p => ({ ...p, has_pets: v }))} />
            <Label>This household has pets</Label>
          </div>
        </div>

        {/* Section 2: Children */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Children</h2>
          <p className="text-sm text-gray-500">Add at least one child to continue.</p>
          {children.map((c, i) => (
            <div key={i} className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label>First name *</Label>
                <Input value={c.first_name} onChange={e => updateChild(i, 'first_name', e.target.value)} className="mt-1" />
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Date of birth *</Label>
                  <Input type="date" max={new Date().toISOString().split('T')[0]} value={c.date_of_birth} onChange={e => updateChild(i, 'date_of_birth', e.target.value)} className="mt-1" />
                </div>
                {children.length > 1 && (
                  <button onClick={() => removeChild(i)} className="text-gray-400 hover:text-red-500 pb-2">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button onClick={addChild} className="flex items-center gap-2 text-sm text-[#C36239] font-medium hover:underline">
            <Plus className="w-4 h-4" /> Add a child
          </button>
        </div>

        {/* Section 3: Address */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Where will care take place?</h2>
          <p className="text-sm text-gray-500">Your full address is shared with a caregiver only after they accept your booking.</p>
          <div>
            <Label>Street address *</Label>
            <Input value={address.street} onChange={e => setAddress(p => ({ ...p, street: e.target.value }))} className="mt-1" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>City *</Label>
              <Input value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>State *</Label>
              <Input value={address.state} onChange={e => setAddress(p => ({ ...p, state: e.target.value }))} placeholder="NY" className="mt-1" />
            </div>
            <div>
              <Label>Zip *</Label>
              <Input value={address.zip} onChange={e => setAddress(p => ({ ...p, zip: e.target.value }))} className="mt-1" />
            </div>
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={saving} className="w-full bg-[#C36239] hover:bg-[#A0522D] text-white py-3 text-base">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save & Continue'}
        </Button>

      </div>
    </div>
  );
}