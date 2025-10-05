import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { Product } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import ProductModal from '../components/modals/ProductModal';

type SortConfig = { key: string; direction: 'asc' | 'desc' };

const InventoryPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'asc' });

  const canManageInventory = profile?.role !== 'field_service_employee';
  const canCreate = profile?.role !== 'field_service_employee' && profile?.role !== 'super_admin';
  const isFieldServiceEmployee = profile?.role === 'field_service_employee';

  const fetchProducts = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);

    let query = supabase.from('products').select('*, organizations(name)');

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }
    
    if (searchTerm) {
      query = query.or(`name.ilike.%${searchTerm}%,product_number.ilike.%${searchTerm}%`);
    }

    const { data, error } = await query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });

    if (error) console.error('Error fetching products:', error.message);
    else setProducts(data || []);
    
    setLoading(false);
  }, [user, profile, searchTerm, sortConfig]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts, refreshKey]);

  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleOpenModal = (product: Product | null = null) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  const handleSaveProduct = async (productData: Partial<Product>) => {
    const { data, error } = await supabase.from('products').upsert(productData).select().single();
    if (error) alert('Error saving product: ' + error.message);
    else {
      fetchProducts();
      handleCloseModal();
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) alert('Error deleting product: ' + error.message);
      else setProducts(products.filter(p => p.id !== id));
    }
  };

  const SortableHeader: React.FC<{ sortKey: string; label: string; }> = ({ sortKey, label }) => (
    <th 
        className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        onClick={() => handleSort(sortKey)}
    >
        <div className="flex items-center">
            <span>{label}</span>
            {sortConfig.key === sortKey && (
                sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-4 h-4 ml-1" /> : <ChevronDownIcon className="w-4 h-4 ml-1" />
            )}
        </div>
    </th>
  );
  
  const MobileProductCard: React.FC<{ product: Product }> = ({ product }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-2">
        <div className="flex justify-between items-start">
            <div>
                <p className="font-bold">{product.name}</p>
                <p className="text-sm font-mono text-gray-500">{product.product_number}</p>
            </div>
            <span className="font-bold text-lg">€{product.selling_price.toFixed(2)}</span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
            Stock: {product.stock_level ?? 'N/A'}
        </p>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('inventory')}</h1>
          {canCreate && (
            <button onClick={() => handleOpenModal()} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
              <PlusIcon className="w-5 h-5 mr-2" /> New Product
            </button>
          )}
        </div>

        <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
          <input 
            type="text"
            placeholder="Search by name or product number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
          />
        </div>

        {loading ? <div className="p-6 text-center text-gray-500">Loading...</div> : (
          isFieldServiceEmployee ? (
            <div className="space-y-4">
                 {products.length > 0 ? products.map(product => (
                    <MobileProductCard key={product.id} product={product} />
                  )) : <p className="p-6 text-center text-gray-500">No products found.</p>}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead>
                    <tr>
                        <SortableHeader sortKey="product_number" label="Product #" />
                        <SortableHeader sortKey="name" label="Name" />
                        {profile?.role === 'super_admin' && <SortableHeader sortKey="organizations.name" label="Organization" />}
                        <SortableHeader sortKey="selling_price" label="Price" />
                        <SortableHeader sortKey="stock_level" label="Stock" />
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                    </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800">
                    {products.map(product => (
                        <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{product.product_number}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{product.name}</td>
                        {profile?.role === 'super_admin' && <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{product.organizations?.name || 'N/A'}</td>}
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">€{product.selling_price.toFixed(2)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{product.stock_level ?? 'N/A'}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            {canManageInventory && (
                            <>
                                <button onClick={() => handleOpenModal(product)} className="text-primary-600 hover:text-primary-800"><PencilIcon className="w-5 h-5"/></button>
                                <button onClick={() => handleDeleteProduct(product.id)} className="text-red-600 hover:text-red-800"><TrashIcon className="w-5 h-5"/></button>
                            </>
                            )}
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            </div>
            )
        )}
      </div>
      {isModalOpen && <ProductModal product={selectedProduct} closeModal={handleCloseModal} onSave={handleSaveProduct} />}
    </>
  );
};

export default InventoryPage;