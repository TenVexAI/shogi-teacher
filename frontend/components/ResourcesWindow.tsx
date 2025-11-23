import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Trash2, Eye, EyeOff, FileText } from 'lucide-react';
import {
  getLLMConfig,
  updateLLMConfig,
  listReferenceFiles,
  uploadReferenceFile,
  deleteReferenceFile,
  getSessionReferences,
  toggleSessionReference
} from '@/lib/api';

interface ResourcesWindowProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
}

interface ReferenceFile {
  id: number;
  name: string;
  description: string;
  file_type: string;
  file_size: number;
  created_at: string;
  enabled?: boolean;
}

interface LLMConfig {
  api_keys: Record<string, string>;
  selected_provider: string;
  selected_model: string;
  available_models: Record<string, string[]>;
}

export default function ResourcesWindow({ isOpen, onClose, sessionId }: ResourcesWindowProps) {
  // Reference Files State
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploadType, setUploadType] = useState('txt');
  
  // LLM Config State
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [selectedProvider, setSelectedProvider] = useState('claude');
  const [selectedModel, setSelectedModel] = useState('');
  const [saving, setSaving] = useState(false);

  const loadFiles = useCallback(async () => {
    try {
      if (sessionId) {
        const sessionFiles = await getSessionReferences(sessionId);
        setFiles(sessionFiles);
      } else {
        const allFiles = await listReferenceFiles();
        setFiles(allFiles);
      }
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  }, [sessionId]);

  const loadLLMConfig = useCallback(async () => {
    try {
      const config = await getLLMConfig();
      setLlmConfig(config);
      setApiKeys(config.api_keys || {});
      setSelectedProvider(config.selected_provider);
      setSelectedModel(config.selected_model);
    } catch (error) {
      console.error('Failed to load LLM config:', error);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
      loadLLMConfig();
    }
  }, [isOpen, loadFiles, loadLLMConfig]);

  const handleUpload = async () => {
    if (!uploadName || !uploadContent) {
      alert('Please provide a name and content for the file');
      return;
    }

    try {
      await uploadReferenceFile(uploadName, uploadDescription, uploadType, uploadContent);
      setUploadName('');
      setUploadDescription('');
      setUploadContent('');
      loadFiles();
    } catch (error: unknown) {
      alert(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async (fileId: number) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      await deleteReferenceFile(fileId);
      loadFiles();
    } catch {
      alert('Failed to delete file');
    }
  };

  const handleToggle = async (fileId: number, enabled: boolean) => {
    if (!sessionId) return;

    try {
      await toggleSessionReference(sessionId, fileId, enabled);
      loadFiles();
    } catch {
      alert('Failed to toggle file');
    }
  };

  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setUploadContent(content);
      if (!uploadName) {
        setUploadName(file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveLLMConfig = async () => {
    setSaving(true);
    try {
      // Only send non-masked API keys (filter out masked values)
      const cleanedKeys: Record<string, string> = {};
      for (const [provider, key] of Object.entries(apiKeys)) {
        // Skip masked keys (ones with • or ...)
        if (key && !key.includes('•') && !key.includes('...')) {
          cleanedKeys[provider] = key;
        }
      }
      
      await updateLLMConfig({
        api_keys: cleanedKeys,
        selected_provider: selectedProvider,
        selected_model: selectedModel
      });
      alert('LLM configuration saved!');
    } catch {
      alert('Failed to save LLM configuration');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background-secondary border border-border rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <h2 className="text-2xl font-bold text-accent-purple mb-6 font-pixel">LLM Settings & Resources</h2>

        {/* LLM Configuration Section */}
        <div className="space-y-4 mb-6 pb-6 border-b border-border">
          <h3 className="text-lg font-semibold text-text-primary">LLM Configuration</h3>
          
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-text-primary">Active Provider</label>
            <div className="grid grid-cols-3 gap-2">
              {['claude', 'openai', 'google'].map((provider) => (
                <label
                  key={provider}
                  className="flex items-center gap-2 p-2 bg-background-primary rounded border border-border cursor-pointer hover:border-accent-cyan transition-colors"
                >
                  <input
                    type="radio"
                    name="provider"
                    value={provider}
                    checked={selectedProvider === provider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-semibold text-text-primary capitalize">
                    {provider === 'google' ? 'Gemini' : provider}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* API Keys */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-text-primary">API Keys</label>
            <div className="space-y-2">
              {['claude', 'openai', 'google'].map((provider) => (
                <div key={provider} className="flex gap-2 items-center">
                  <span className="text-xs text-text-secondary w-16 capitalize">
                    {provider === 'google' ? 'Gemini' : provider}:
                  </span>
                  <input
                    type={showKeys[provider] ? 'text' : 'password'}
                    value={apiKeys[provider] || ''}
                    onChange={(e) => setApiKeys({ ...apiKeys, [provider]: e.target.value })}
                    className="flex-1 p-2 bg-background-primary border border-border rounded text-text-primary font-mono text-sm"
                    placeholder={`Enter ${provider} API key...`}
                  />
                  <button
                    onClick={() => setShowKeys({ ...showKeys, [provider]: !showKeys[provider] })}
                    className="p-2 bg-background-primary border border-border rounded hover:bg-background-secondary transition-colors"
                    title={showKeys[provider] ? 'Hide' : 'Show'}
                  >
                    {showKeys[provider] ? (
                      <EyeOff className="w-4 h-4 text-text-secondary" />
                    ) : (
                      <Eye className="w-4 h-4 text-text-secondary" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-text-primary">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full p-2 bg-background-primary border border-border rounded text-text-primary"
            >
              <option value="">Select a model...</option>
              {llmConfig?.available_models[selectedProvider]?.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Reference Files Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-text-primary">Reference Files</h3>
          
          {/* Upload Section */}
          <div className="p-4 bg-background-primary rounded-lg border border-border">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-text-primary">Name</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="w-full p-2 bg-background-secondary border border-border rounded text-text-primary text-sm"
                  placeholder="Opening Theory.txt"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-text-primary">Type</label>
                <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  className="w-full p-2 bg-background-secondary border border-border rounded text-text-primary text-sm"
                >
                  <option value="txt">Text (.txt)</option>
                  <option value="md">Markdown (.md)</option>
                  <option value="sgf">SGF Game (.sgf)</option>
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1 text-text-primary">Description</label>
              <input
                type="text"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                className="w-full p-2 bg-background-secondary border border-border rounded text-text-primary text-sm"
                placeholder="Joseki patterns for early game"
              />
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1 text-text-primary">Content</label>
              <div className="mb-2">
                <input
                  type="file"
                  accept=".txt,.md,.sgf"
                  onChange={handleFileRead}
                  className="text-xs text-text-secondary"
                />
              </div>
              <textarea
                value={uploadContent}
                onChange={(e) => setUploadContent(e.target.value)}
                className="w-full p-2 bg-background-secondary border border-border rounded text-text-primary font-mono text-sm"
                rows={4}
                placeholder="Paste or type content here..."
              />
            </div>
            <button
              onClick={handleUpload}
              className="flex items-center gap-2 px-3 py-2 bg-accent-cyan text-white rounded text-sm hover:opacity-80 transition-opacity"
            >
              <Upload className="w-4 h-4" />
              Upload File
            </button>
          </div>

          {/* Files List */}
          <div>
            <div className="text-sm font-semibold mb-2 text-text-secondary">
              Uploaded Files ({files.length})
            </div>
            {files.length === 0 ? (
              <p className="text-text-secondary text-center py-4 text-sm">No reference files uploaded yet</p>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-2 bg-background-primary rounded border border-border"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {sessionId && (
                        <input
                          type="checkbox"
                          checked={file.enabled || false}
                          onChange={(e) => handleToggle(file.id, e.target.checked)}
                          className="w-4 h-4"
                        />
                      )}
                      <FileText className="w-4 h-4 text-accent-cyan" />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-text-primary">{file.name}</div>
                        {file.description && (
                          <div className="text-xs text-text-secondary">{file.description}</div>
                        )}
                        <div className="text-xs text-text-secondary">
                          {file.file_type.toUpperCase()} • {Math.round(file.file_size / 1024)}KB
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="p-2 hover:bg-background-secondary rounded transition-colors"
                      title="Delete file"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-semibold text-sm bg-background-primary border border-border hover:bg-background-primary/50 text-text-primary transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSaveLLMConfig}
            disabled={saving}
            className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent-purple hover:bg-[#8a6fd1] text-white transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
