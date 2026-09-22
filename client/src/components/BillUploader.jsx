import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function BillUploader({ category, title, badgeText, description }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [notification, setNotification] = useState(null);
  const [storedFiles, setStoredFiles] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const fileInputRef = useRef(null);

  // Fetch list of already stored bills in this category
  const loadStoredBills = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch(`/api/bills/uploads/${category}`);
      if (res.ok) {
        const data = await res.json();
        setStoredFiles(data.files || []);
      }
    } catch (err) {
      console.error(`Failed to load ${category} bills:`, err);
    } finally {
      setIsLoadingList(false);
    }
  }, [category]);

  useEffect(() => {
    let isSubscribed = true;
    fetch(`/api/bills/uploads/${category}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Fetch failed'))))
      .then((data) => {
        if (isSubscribed) {
          setStoredFiles(data.files || []);
        }
      })
      .catch((err) => {
        if (isSubscribed) {
          console.error(`Failed to load ${category} bills:`, err);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [category]);

  const handleFileSelect = (file) => {
    if (!file) return;
    setSelectedFile(file);
    setNotification(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return dateString;
    }
  };

  // Upload handler
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setNotification({ type: 'info', message: 'Please select a file to upload first.' });
      return;
    }

    setIsUploading(true);
    setNotification(null);

    const formData = new FormData();
    formData.append('billFile', selectedFile);

    try {
      const response = await fetch(`/api/bills/upload/${category}`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload bill');
      }

      setNotification({
        type: 'success',
        message: `Success: "${selectedFile.name}" has been stored into the ${badgeText} repository with no processing.`,
      });

      // Clear current file selection
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Refresh list of stored bills
      loadStoredBills();
    } catch (err) {
      console.error(err);
      setNotification({
        type: 'danger',
        message: `Upload failed: ${err.message}`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Notification Banner */}
      {notification && (
        <div className={`alert-banner ${notification.type === 'danger' ? 'alert-danger' : notification.type === 'success' ? 'success' : 'info'}`}>
          <span>
            {notification.type === 'success' && '✓ '}
            {notification.type === 'danger' && '⚠️ '}
            {notification.type === 'info' && 'ℹ️ '}
            {notification.message}
          </span>
        </div>
      )}

      {/* Main Upload Card */}
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{title}</h2>
            <p className="panel-subtitle">{description}</p>
          </div>
          <span className="tab-badge count">
            Direct Storage (No Processing)
          </span>
        </div>

        <form onSubmit={handleUpload}>
          {/* Drag & Drop Area */}
          <div
            className={`dropzone-container ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="file-input-hidden"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
            />

            <div className="dropzone-icon">
              📁
            </div>

            <h3 className="dropzone-title">
              Click to select or drag and drop your {badgeText.toLowerCase()} bill
            </h3>
            <p className="dropzone-subtitle">
              Supports PDF, PNG, JPG, JPEG, or DOCX documents up to 25 MB
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={(e) => {
                e.stopPropagation();
                if (fileInputRef.current) {
                  fileInputRef.current.click();
                }
              }}
            >
              Browse Computer
            </button>
          </div>

          {/* Selected File Details & Upload Action */}
          {selectedFile && (
            <div className="selected-file-card animate-fade-in">
              <div className="file-info">
                <span style={{ fontSize: '1.5rem' }}>📄</span>
                <div>
                  <div className="file-name">{selectedFile.name}</div>
                  <div className="file-meta">
                    {formatFileSize(selectedFile.size)} • Ready to store
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedFile(null)}
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isUploading}
                >
                  {isUploading ? 'Uploading & Storing...' : 'Upload & Store Bill'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Stored Files Vault List */}
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Stored {badgeText} Bills</h3>
            <p className="panel-subtitle">
              All stored records ({storedFiles.length} {storedFiles.length === 1 ? 'file' : 'files'})
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadStoredBills}
            disabled={isLoadingList}
          >
            {isLoadingList ? 'Refreshing...' : '🔄 Refresh List'}
          </button>
        </div>

        {storedFiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
            <p>No {badgeText.toLowerCase()} bills stored yet.</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Upload your first bill using the dropzone above.
            </p>
          </div>
        ) : (
          <div className="vault-list">
            {storedFiles.map((file) => (
              <div key={file.fileName} className="vault-item">
                <div className="vault-item-left">
                  <span style={{ fontSize: '1.4rem' }}>📑</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                      {file.fileName.replace(/^\d+-\d+-/, '')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Uploaded on {formatDate(file.uploadedAt)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="vault-badge">
                    {formatFileSize(file.sizeBytes)}
                  </span>
                  <a
                    href={`/uploads/${category}/${file.fileName}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                  >
                    View / Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
