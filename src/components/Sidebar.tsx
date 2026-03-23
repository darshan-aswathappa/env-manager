import { FolderOpen, Plus, Trash2, GitBranch } from "lucide-react";
import type { ProjectTreeNode } from "../types";

interface SidebarProps {
  projectTree: ProjectTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onAddSubProject: (parentId: string) => void;
}

const PROJECT_COLORS = [
  "#a78bfa", // soft violet
  "#34d399", // mint
  "#f472b6", // rose
  "#fbbf24", // amber
  "#fb7185", // coral
];

function dotColor(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

let colorIndex = 0;

function ProjectNodeItem({
  node,
  selectedId,
  onSelect,
  onDelete,
  onAddSubProject,
  index,
}: {
  node: ProjectTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAddSubProject: (parentId: string) => void;
  index: number;
}) {
  const { project, depth, children } = node;
  const paddingLeft = depth * 16;

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
        <span
          className="project-dot"
          style={{ background: dotColor(index) }}
          aria-hidden="true"
        />
        <div className="project-info">
          <div className="project-name">{project.name}</div>
          <div className="project-count">
            {project.vars.length} var{project.vars.length !== 1 ? "s" : ""}
          </div>
        </div>
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
      {children.map((child, childIdx) => (
        <ProjectNodeItem
          key={child.project.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
          onAddSubProject={onAddSubProject}
          index={index + childIdx + 1}
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
}: SidebarProps) {
  const totalProjects = countNodes(projectTree);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="app-logo">
          <div className="app-logo-icon">
            <FolderOpen size={15} />
          </div>
          <span className="app-title">dotenv</span>
        </div>
        <div className="app-subtitle">Manager</div>
      </div>

      <div className="sidebar-section-label">Projects</div>

      <div className="sidebar-list">
        {totalProjects === 0 && (
          <p className="sidebar-empty">
            No projects yet. Click "Add project" to get started.
          </p>
        )}

        {projectTree.map((node, index) => (
          <ProjectNodeItem
            key={node.project.id}
            node={node}
            selectedId={selectedId}
            onSelect={onSelect}
            onDelete={onDelete}
            onAddSubProject={onAddSubProject}
            index={index}
          />
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-footer-btn" disabled aria-label="Trash (coming soon)">
          <Trash2 size={14} />
          <span>Trash</span>
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
