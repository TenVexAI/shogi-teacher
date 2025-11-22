'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Home, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import { learnContent, ContentSection } from '@/content/learnContent';

export default function LearnPage() {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentSubsectionIndex, setCurrentSubsectionIndex] = useState<number | null>(null);
  const [showTOC, setShowTOC] = useState(true);

  // Flatten content for navigation
  const allSections: { section: ContentSection; subsectionIndex?: number; parentIndex?: number }[] = [];
  learnContent.forEach((section, sectionIndex) => {
    allSections.push({ section, parentIndex: sectionIndex });
    if (section.subsections) {
      section.subsections.forEach((subsection, subsectionIndex) => {
        allSections.push({ section: subsection, subsectionIndex, parentIndex: sectionIndex });
      });
    }
  });

  const currentIndex = currentSubsectionIndex !== null
    ? allSections.findIndex(item => 
        item.parentIndex === currentSectionIndex && item.subsectionIndex === currentSubsectionIndex
      )
    : allSections.findIndex(item => 
        item.parentIndex === currentSectionIndex && item.subsectionIndex === undefined
      );

  const currentContent = currentSubsectionIndex !== null
    ? learnContent[currentSectionIndex]?.subsections?.[currentSubsectionIndex]
    : learnContent[currentSectionIndex];

  // Generate dynamic header title
  const currentTitle = currentSubsectionIndex !== null
    ? `${learnContent[currentSectionIndex]?.title}: ${currentContent?.title}`
    : currentContent?.title || 'Learn to Play Shogi';

  // Set static window title
  useEffect(() => {
    document.title = 'Learn to Play Shogi';
  }, []);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prev = allSections[currentIndex - 1];
      setCurrentSectionIndex(prev.parentIndex!);
      setCurrentSubsectionIndex(prev.subsectionIndex ?? null);
    }
  };

  const handleNext = () => {
    if (currentIndex < allSections.length - 1) {
      const next = allSections[currentIndex + 1];
      setCurrentSectionIndex(next.parentIndex!);
      setCurrentSubsectionIndex(next.subsectionIndex ?? null);
    }
  };

  const handleHome = () => {
    setCurrentSectionIndex(0);
    setCurrentSubsectionIndex(null);
  };

  const handleSectionClick = (sectionIndex: number, subsectionIndex?: number) => {
    setCurrentSectionIndex(sectionIndex);
    setCurrentSubsectionIndex(subsectionIndex ?? null);
    // Don't hide TOC when clicking a link
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header with Navigation - Fixed at top */}
      <div className="bg-background-secondary border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowTOC(!showTOC)}
            className="p-2 hover:bg-background-primary rounded-lg transition-colors"
            title="Toggle Table of Contents"
          >
            <Menu className="w-6 h-6 text-text-primary" />
          </button>
          <h1 className="text-2xl font-bold text-accent-cyan font-pixel">{currentTitle}</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleHome}
            disabled={currentIndex === 0}
            className="p-2 hover:bg-background-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Home"
          >
            <Home className="w-5 h-5 text-text-primary" />
          </button>
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="p-2 hover:bg-background-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous"
          >
            <ChevronLeft className="w-5 h-5 text-text-primary" />
          </button>
          <span className="text-text-secondary text-sm px-2">
            {currentIndex + 1} / {allSections.length}
          </span>
          <button
            onClick={handleNext}
            disabled={currentIndex === allSections.length - 1}
            className="p-2 hover:bg-background-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next"
          >
            <ChevronRight className="w-5 h-5 text-text-primary" />
          </button>
        </div>
      </div>

      {/* Main content area with TOC and content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Table of Contents Sidebar */}
        <div className={`${showTOC ? 'w-80' : 'w-0'} transition-all duration-300 overflow-hidden bg-background-secondary border-r border-border`}>
          <div className="p-6 h-full overflow-y-auto">
          <h2 className="text-2xl font-bold text-accent-cyan mb-6 font-pixel">Table of Contents</h2>
          <nav className="space-y-2">
            {learnContent.map((section, sectionIndex) => (
              <div key={section.id}>
                <button
                  onClick={() => handleSectionClick(sectionIndex)}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                    currentSectionIndex === sectionIndex && currentSubsectionIndex === null
                      ? 'bg-accent-cyan text-background-primary font-bold'
                      : 'text-text-primary hover:bg-background-primary'
                  }`}
                >
                  {section.title}
                </button>
                {section.subsections && (
                  <div className="ml-4 mt-1 space-y-1">
                    {section.subsections.map((subsection, subsectionIndex) => (
                      <button
                        key={subsection.id}
                        onClick={() => handleSectionClick(sectionIndex, subsectionIndex)}
                        className={`w-full text-left px-4 py-1.5 rounded-lg text-sm transition-colors ${
                          currentSectionIndex === sectionIndex && currentSubsectionIndex === subsectionIndex
                            ? 'bg-accent-purple text-white font-semibold'
                            : 'text-text-secondary hover:bg-background-primary hover:text-text-primary'
                        }`}
                      >
                        {subsection.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            {currentContent && (
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-4xl font-bold text-accent-cyan mb-6 font-pixel">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-3xl font-bold text-accent-purple mt-8 mb-4 font-pixel">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-2xl font-semibold text-text-primary mt-6 mb-3">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-text-primary text-lg leading-relaxed mb-4">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside text-text-primary text-lg space-y-2 mb-4 ml-4">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside text-text-primary text-lg space-y-2 mb-4 ml-4">{children}</ol>
                    ),
                    strong: ({ children }) => (
                      <strong className="text-accent-cyan font-bold">{children}</strong>
                    ),
                    code: ({ children }) => (
                      <code className="bg-background-secondary px-2 py-1 rounded text-accent-purple">{children}</code>
                    ),
                  }}
                >
                  {currentContent.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
          </div>

          {/* Footer Navigation */}
          <div className="bg-background-secondary border-t border-border px-6 py-4 flex justify-between items-center shrink-0">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 px-4 py-2 bg-accent-purple text-white rounded-lg hover:bg-[#8a6fd1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-pixel"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === allSections.length - 1}
              className="flex items-center gap-2 px-4 py-2 bg-accent-cyan text-background-primary rounded-lg hover:bg-[#0fc9ad] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-pixel"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
