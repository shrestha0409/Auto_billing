import React, { useState } from 'react';
import CreateBill from './components/CreateBill';
import BillUploader from './components/BillUploader';

function App() {
  // Navigation State strictly for the 3 requested options
  const [activeTab, setActiveTab] = useState('create'); // 'create' | 'manufacturer' | 'miscellaneous'

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="header-inner">
          {/* Logo & Portal Title */}
          <div className="brand">
            <div className="brand-icon">
              ⚡
            </div>
            <div className="brand-info">
              <h1>AutoBilling</h1>
              <p>Invoice Generation & Document Vault</p>
            </div>
          </div>

          {/* Strictly 3 Navigation Options */}
          <nav className="tab-navigation" aria-label="Main Navigation">
            <button
              type="button"
              className={`nav-tab-btn ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => setActiveTab('create')}
            >
              <span>📝</span>
              <span>1. Create Bill</span>
              <span className="tab-badge tax">Flexible GST</span>
            </button>

            <button
              type="button"
              className={`nav-tab-btn ${activeTab === 'manufacturer' ? 'active' : ''}`}
              onClick={() => setActiveTab('manufacturer')}
            >
              <span>🏭</span>
              <span>2. Manufacturer Bill</span>
            </button>

            <button
              type="button"
              className={`nav-tab-btn ${activeTab === 'miscellaneous' ? 'active' : ''}`}
              onClick={() => setActiveTab('miscellaneous')}
            >
              <span>📑</span>
              <span>3. Miscellaneous Bill</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Tab Panels */}
      <main className="main-content">
        {activeTab === 'create' && <CreateBill />}

        {activeTab === 'manufacturer' && (
          <BillUploader
            category="manufacturer"
            title="Manufacturer Bill Vault"
            badgeText="Manufacturer"
            description="Upload and store manufacturer bills directly in the storage repository without processing."
          />
        )}

        {activeTab === 'miscellaneous' && (
          <BillUploader
            category="miscellaneous"
            title="Miscellaneous Bill Vault"
            badgeText="Miscellaneous"
            description="Upload and store miscellaneous bills directly in the storage repository without processing."
          />
        )}
      </main>

      {/* App Footer */}
      <footer className="app-footer">
        <p>
          AutoBilling Portal • Option 1: Create Bill (Item-wise Flexible GST & PDF) • Option 2: Manufacturer Bill (Storage Only) • Option 3: Miscellaneous Bill (Storage Only)
        </p>
      </footer>
    </div>
  );
}

export default App;
