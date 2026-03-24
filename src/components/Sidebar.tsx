import { useState } from "react";
import { FolderOpen, Plus, Trash2, GitBranch, Terminal, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ProjectTreeNode } from "../types";

interface SidebarProps {
  projectTree: ProjectTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onAddSubProject: (parentId: string) => void;
  onOpenShellIntegration: () => void;
}

const NEUTRAL_DOT = "#3a3a3c";

function ProjectNodeItem({
  node,
  selectedId,
  onSelect,
  onDelete,
  onAddSubProject,
}: {
  node: ProjectTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAddSubProject: (parentId: string) => void;
}) {
  const { project, depth, children } = node;
  const paddingLeft = depth * 16;
  const hasChildren = children.length > 0;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <div
        className={`project-item${selectedId === project.id ? " active" : ""}`}
        style={{ paddingLeft: `${8 + paddingLeft}px` }}
        onClick={() => onSelect(project.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(project.id);
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
            style={{ background: NEUTRAL_DOT }}
            aria-hidden="true"
          />
        )}
        <div className="project-info">
          <div className="project-name">{project.name}</div>
        </div>
        <span className="project-count" aria-label={`${project.vars.length} variables`}>
          {project.vars.length}
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
        <button
          className="project-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project.id);
          }}
          aria-label={`Remove project ${project.name}`}
          title="Remove project"
        >
          ×
        </button>
      </div>
      {!collapsed &&
        children.map((child) => (
          <ProjectNodeItem
            key={child.project.id}
            node={child}
            selectedId={selectedId}
            onSelect={onSelect}
            onDelete={onDelete}
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
}: SidebarProps) {
  const totalProjects = countNodes(projectTree);
  const [collapsed, setCollapsed] = useState(false);

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
              <FolderOpen size={15} className="app-logo-icon-flat" aria-hidden="true" />
              <span className="app-title">dotenv Manager</span>
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
            onSelect={onSelect}
            onDelete={onDelete}
            onAddSubProject={onAddSubProject}
          />
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-footer-btn" disabled aria-label="Trash (coming soon)">
          <Trash2 size={14} />
          <span>Trash</span>
        </button>
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
