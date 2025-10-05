import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Product } from '../../types';
import { generateNextNumber } from '../../lib/numberGenerator';

interface ProductModalProps {
  product: Product | null;
  closeModal: () => void;
  onSave: (product: Partial<Product>) => void;
}

const ProductModal: React.FC<ProductModalProps> = ({ product, closeModal, onSave }) => {
  const { user, profile } = useAuth();
  const [formData, setFormData] = useState({
    name: product?.name || '',
    description: product?.description || '',
    selling_price: product?.selling_price || 0,
    stock_level: product?.stock_level || null,
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? (value === '' ? null : parseFloat(value)) : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile?.org_id) {
        alert("Cannot save product: User or Organization information is missing.");
        return;
    }
    setLoading(true);

    try {
        let productData: Partial<Product> = { ...formData };

        if (product?.id) { // Editing
            productData.id = product.id;
        } else { // Creating
            const newNumber = await generateNextNumber(profile.org_id, 'product');
            productData = {
                ...productData,
                user_id: user.id,
                org_id: profile.org_id,
                product_number: newNumber,
            };
        }
        onSave(productData);
    } catch (error: any) {
        alert('Error saving product: ' + error.message);
    }
    setLoading(false);
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-bold mb-4">{product ? 'Edit Product' : 'Add New Product'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input name="name" value={formData.name} onChange={handleChange} placeholder="Product Name" required className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
          <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Description" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
          <div className="grid grid-cols-2 gap-4">
            <input name="selling_price" type="number" step="0.01" value={formData.selling_price} onChange={handleChange} placeholder="Selling Price (€)" required className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
            <input name="stock_level" type="number" value={formData.stock_level ?? ''} onChange={handleChange} placeholder="Stock Level (optional)" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
          </div>
          <div className="flex justify-end space-x-2">
            <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-white bg-primary-600 rounded disabled:bg-primary-300">{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductModal;
