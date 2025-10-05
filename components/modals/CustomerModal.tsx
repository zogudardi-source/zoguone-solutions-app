
import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Customer } from '../../types';
import { generateNextNumber } from '../../lib/numberGenerator';

interface CustomerModalProps {
  customer: Customer | null;
  closeModal: () => void;
  onSave: (newCustomer: Customer) => void;
}

const CustomerModal: React.FC<CustomerModalProps> = ({ customer, closeModal, onSave }) => {
  const { user, profile } = useAuth();
  const [formData, setFormData] = useState({
    name: customer?.name || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    address: customer?.address || ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; phone?: string }>({});
  
  const validate = () => {
    const newErrors: { email?: string; phone?: string } = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[+\d()-\s]*$/;

    if (formData.email && !emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address.';
    }
    if (formData.phone && !phoneRegex.test(formData.phone)) {
      newErrors.phone = 'Please enter a valid phone number format.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({...prev, [name]: value }));
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      return;
    }
    if(!user || !profile?.org_id) {
      alert("Cannot save customer: User or Organization information is missing.");
      return;
    }
    setLoading(true);

    try {
        if (customer?.id) { // Editing
            const customerData = { ...formData };
            const { data, error } = await supabase
                .from('customers')
                .update(customerData)
                .eq('id', customer.id)
                .select()
                .single();
            
            if (error) throw error;
            if (data) onSave(data);

        } else { // Creating
            const newNumber = await generateNextNumber(profile.org_id, 'customer');
            const customerData = { 
                ...formData, 
                user_id: user.id,
                org_id: profile.org_id,
                customer_number: newNumber,
            };
            const { data, error } = await supabase
                .from('customers')
                .insert(customerData)
                .select()
                .single();
            
            if (error) throw error;
            if (data) onSave(data);
        }
    } catch (error: any) {
        alert('Error saving customer: ' + error.message);
    }

    setLoading(false);
  };
  
  return (
     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 id="customer-modal-title" className="text-xl font-bold mb-4">{customer ? `Edit Customer (${customer.customer_number})` : 'Add New Customer'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <input name="name" value={formData.name} onChange={handleChange} placeholder="Customer Name" required className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                </div>
                <div>
                  <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Email" className={`w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 ${errors.email ? 'border-red-500' : ''}`}/>
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>
                <div>
                  <input name="phone" value={formData.phone} onChange={handleChange} placeholder="Phone" className={`w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 ${errors.phone ? 'border-red-500' : ''}`}/>
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                </div>
                <div>
                  <textarea name="address" value={formData.address} onChange={handleChange} placeholder="Address" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                </div>
                <div className="flex justify-end space-x-2">
                    <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                    <button type="submit" disabled={loading} className="px-4 py-2 text-white bg-primary-600 rounded disabled:bg-primary-300">{loading ? 'Saving...' : 'Save'}</button>
                </div>
            </form>
        </div>
    </div>
  )
}

export default CustomerModal;
