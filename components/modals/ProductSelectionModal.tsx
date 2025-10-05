import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Product } from '../../types';

interface ProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (products: Product[]) => void;
}

const ProductSelectionModal: React.FC<ProductSelectionModalProps> = ({ isOpen, onClose, onAdd }) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const fetchProducts = useCallback(async () => {
    if (!user || !profile?.org_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching products:', error);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  }, [user, profile]);

  useEffect(() => {
    if (isOpen) {
      fetchProducts();
    }
  }, [isOpen, fetchProducts]);

  const handleToggleSelection = (id: number) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const handleAddSelected = () => {
    const selectedProducts = products.filter(product => selectedIds.has(product.id));
    onAdd(selectedProducts);
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.product_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="product-selection-modal-title">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6 flex flex-col h-[80vh] max-h-[600px]">
        <h2 id="product-selection-modal-title" className="text-xl font-bold mb-4">{t('addProducts')}</h2>
        
        <input
          type="text"
          placeholder="Search products by name or number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded mb-4 dark:bg-gray-700 dark:border-gray-600"
        />

        <div className="flex-1 overflow-y-auto border-t border-b dark:border-gray-700">
          {loading ? (
            <p className="text-center p-4">Loading products...</p>
          ) : (
            <ul className="divide-y dark:divide-gray-700">
              {filteredProducts.map(product => (
                <li key={product.id} className="p-3 flex items-center hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(product.id)}
                    onChange={() => handleToggleSelection(product.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="ml-3 text-sm">
                    <p className="font-medium text-gray-900 dark:text-gray-200">{product.name} ({product.product_number})</p>
                    <p className="text-gray-500 dark:text-gray-400">
                      €{product.selling_price.toFixed(2)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleAddSelected}
            disabled={selectedIds.size === 0}
            className="px-4 py-2 text-white bg-primary-600 rounded disabled:bg-primary-300"
          >
            {t('addSelected')} ({selectedIds.size})
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductSelectionModal;