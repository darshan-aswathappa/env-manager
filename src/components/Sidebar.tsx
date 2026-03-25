import { useState } from "react";
import { Plus, GitBranch, Terminal, Settings, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ProjectTreeNode } from "../types";
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
}: {
  node: ProjectTreeNode;
  selectedId: string | null;
  pendingDeleteId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onAddSubProject: (parentId: string) => void;
}) {
  const { project, depth, children } = node;
  const paddingLeft = Math.min(depth, 5) * 16;
  const hasChildren = children.length > 0;
  const [collapsed, setCollapsed] = useState(false);
  const confirming = pendingDeleteId === project.id;

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
                transition: "transform 150ms ease",
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
        <span className="project-count" aria-label={`${project.vars.length} variables`}>
          {project.vars.length === 1 ? "1 var" : project.vars.length > 0 ? `${project.vars.length} vars` : ""}
        </span>
        <button
          className="project-delete"
          style={{ marginLeft: "2px" }}
          onClick={(e) => {
            e.stopPropagation();
            onAddSubProject(project.id);
          }}
          aria-label={`Add sub-project under ${project.name}`}
          title="Add sub-project"
        >
          <GitBranch size={11} />
        </button>
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
          <button
            className="project-delete"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete(project.id);
            }}
            aria-label={`Remove project ${project.name}`}
            title="Remove project"
          >
            ×
          </button>
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
