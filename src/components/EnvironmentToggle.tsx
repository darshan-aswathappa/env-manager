import { envDisplayName } from '../types'
import type { Environment } from '../types'

interface EnvironmentToggleProps {
  environments: Environment[];
  activeEnv: string;
  envTier?: 'base' | 'dev' | 'warn' | 'prod';
  onSwitch: (suffix: string) => void;
}

export default function EnvironmentToggle({ environments, activeEnv, envTier, onSwitch }: EnvironmentToggleProps) {
  return (
    <div className="env-dropdown-wrapper" data-env-tier={envTier}>
      <select
        className="env-dropdown"
        value={activeEnv}
        onChange={(e) => {
          const newSuffix = e.target.value
          if (newSuffix !== activeEnv) onSwitch(newSuffix)
        }}
        aria-label="Environment"
      >
        {environments.map((env) => (
          <option key={env.suffix} value={env.suffix}>
            {envDisplayName(env.suffix)}{env.vars.length > 0 ? ` (${env.vars.length})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
