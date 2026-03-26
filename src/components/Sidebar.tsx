import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, GitBranch, Terminal, Settings, ChevronRight, PanelLeftClose, PanelLeftOpen, MoreHorizontal, FileCode } from "lucide-react";
import type { ProjectTreeNode, Project } from "../types";
import logo from "../assets/logo.png";

interface SidebarProps {
  projectTree: ProjectTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onAddSubProject: (parentId: string) => void;
  onOpenShellIntegration: () => void;
  onOpenSettings: () => void;
  onImportFromExample: (project: Project) => void;
  onGenerateExample: (project: Project) => void;
}

function ProjectNodeItem({
  node,
  selectedId,
  pendingDeleteId,
  onSelect,
  onDelete,
  onRequestDelete,
  onCancelDelete,
  onAddSubProject,
  onImportFromExample,
  onGenerateExample,
}: {
  node: ProjectTreeNode;
  selectedId: string | null;
  pendingDeleteId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onAddSubProject: (parentId: string) => void;
  onImportFromExample: (project: Project) => void;
  onGenerateExample: (project: Project) => void;
}) {
  const { project, depth, children } = node;
  const paddingLeft = Math.min(depth, 5) * 16;
  const hasChildren = children.length > 0;
  const [collapsed, setCollapsed] = useState(false);
  const confirming = pendingDeleteId === project.id;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <>
      <div
        className={`project-item${selectedId === project.id ? " active" : ""}${confirming ? " confirming" : ""}`}
        style={{ paddingLeft: `${8 + paddingLeft}px` }}
        onClick={() => { if (!confirming) onSelect(project.id); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Escape" && confirming) {
            e.preventDefault();
            onCancelDelete();
            return;
          }
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!confirming) onSelect(project.id);
          }
        }}
        aria-current={selectedId === project.id ? "true" : undefined}
      >
        {hasChildren ? (
          <button
            className="project-delete"
            style={{ marginLeft: 0, marginRight: "2px", padding: "2px" }}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            aria-label={collapsed ? `Expand ${project.name}` : `Collapse ${project.name}`}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <ChevronRight
              size={11}
              style={{
                transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
                transition: "transform 150ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </button>
        ) : (
          <span
            className="project-dot"
            aria-hidden="true"
          />
        )}
        <div className="project-info">
          <div className="project-name">{project.name}</div>
        </div>
        {confirming ? (
          <div className="project-confirm-row" onClick={(e) => e.stopPropagation()}>
            <button
              className="project-confirm-yes"
              onClick={(e) => { e.stopPropagation(); onCancelDelete(); onDelete(project.id); }}
              aria-label={`Confirm remove ${project.name}`}
            >
              Remove
            </button>
            <button
              className="project-confirm-no"
              onClick={(e) => { e.stopPropagation(); onCancelDelete(); }}
              aria-label="Cancel remove"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <span className="project-count" aria-label={`${project.vars.length} variables`}>
              {project.vars.length === 1 ? "1 var" : project.vars.length > 0 ? `${project.vars.length} vars` : ""}
            </span>
            <div className="project-overflow-wrapper">
              <button
                ref={btnRef}
                className="project-delete project-overflow-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!menuOpen && btnRef.current) {
                    const rect = btnRef.current.getBoundingClientRect();
                    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                  }
                  setMenuOpen((o) => !o);
                }}
                aria-label="More options"
                title="More options"
              >
                <MoreHorizontal size={11} />
              </button>
              {menuOpen && menuPos && createPortal(
                <>
                  <div
                    className="project-overflow-backdrop"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
                  />
                  <div
                    ref={menuRef}
                    className="project-overflow-menu"
                    style={{ top: menuPos.top, right: menuPos.right }}
                  >
                    <button
                      className="project-overflow-menu-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onAddSubProject(project.id);
                      }}
                    >
                      <GitBranch size={11} />
                      Add sub-project
                    </button>
                    <button
                      className="project-overflow-menu-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onImportFromExample(project);
                      }}
                    >
                      <FileCode size={11} />
                      Import .env.example
                    </button>
                    <button
                      className="project-overflow-menu-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onGenerateExample(project);
                      }}
                    >
                      <FileCode size={11} />
                      Generate .env.example
                    </button>
                    <div className="project-overflow-menu-divider" />
                    <button
                      className="project-overflow-menu-item project-overflow-menu-item--danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onRequestDelete(project.id);
                      }}
                    >
                      Remove project
                    </button>
                  </div>
                </>,
                document.body
              )}
            </div>
          </>
        )}
      </div>
      {!collapsed &&
        children.map((child) => (
          <ProjectNodeItem
            key={child.project.id}
            node={child}
            selectedId={selectedId}
            pendingDeleteId={pendingDeleteId}
            onSelect={onSelect}
            onDelete={onDelete}
            onRequestDelete={onRequestDelete}
            onCancelDelete={onCancelDelete}
            onAddSubProject={onAddSubProject}
            onImportFromExample={onImportFromExample}
            onGenerateExample={onGenerateExample}
          />
        ))}
    </>
  );
}

export default function Sidebar({
  projectTree,
  selectedId,
  onSelect,
  onDelete,
  onAdd,
  onAddSubProject,
  onOpenShellIntegration,
  onOpenSettings,
  onImportFromExample,
  onGenerateExample,
}: SidebarProps) {
  const totalProjects = countNodes(projectTree);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-header">
        {collapsed ? (
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen size={15} />
          </button>
        ) : (
          <>
            <div className="app-logo" style={{ flex: 1 }}>
              <img src={logo} alt="" aria-hidden="true" className="app-logo-img" />
              <span className="app-title">.envVault</span>
            </div>
            <button
              className="sidebar-toggle"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={15} />
            </button>
          </>
        )}
      </div>

      <div className="sidebar-section-label">Projects</div>

      <div className="sidebar-list">
        {totalProjects === 0 && (
          <p className="sidebar-empty">No projects yet.</p>
        )}

        {projectTree.map((node) => (
          <ProjectNodeItem
            key={node.project.id}
            node={node}
            selectedId={selectedId}
            pendingDeleteId={pendingDeleteId}
            onSelect={onSelect}
            onDelete={onDelete}
            onRequestDelete={setPendingDeleteId}
            onCancelDelete={() => setPendingDeleteId(null)}
            onAddSubProject={onAddSubProject}
            onImportFromExample={onImportFromExample}
            onGenerateExample={onGenerateExample}
          />
        ))}
      </div>

      <div className="sidebar-footer">
        <button
          className="sidebar-footer-btn"
          onClick={onOpenShellIntegration}
          aria-label="Open shell integration"
          title="Shell integration"
        >
          <Terminal size={14} />
          <span>Shell</span>
        </button>
        <button
          className="sidebar-footer-btn"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <Settings size={14} />
          <span>Settings</span>
        </button>
        <button
          className="sidebar-footer-btn add-project"
          onClick={onAdd}
          aria-label="Add project folder"
        >
          <Plus size={14} />
          <span>Add project</span>
        </button>
      </div>
    </aside>
  );
}

function countNodes(tree: ProjectTreeNode[]): number {
  return tree.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
}
