import { navigate } from '@/app/router';
import {
  useNotify,
  usePreferences,
  useServices,
  useWorkspace,
  useWorkspaceState,
} from '@/app/services';
import { AppHeader } from '@/modules/dashboard/AppHeader';
import { FilterSidebar } from '@/modules/dashboard/FilterSidebar';
import { ProjectCard } from '@/modules/dashboard/ProjectCard';
import {
  applyQuery,
  countByCategory,
  isFiltered,
  parseQuery,
  serializeQuery,
  SORT_LABELS,
  SORT_ORDERS,
  type ProjectQuery,
  type SortOrder,
} from '@/modules/document/domain/projectQuery';
import type { DesignDocument } from '@/modules/document/domain/schema';
import {
  TemplatePicker,
  type StartingPoint,
} from '@/modules/library/components/TemplatePicker';
import {
  createFromStartingPoint,
  startingPointKey,
} from '@/modules/library/startingPoint';
import { requestPersistentStorage } from '@/modules/workspace/data/storagePersistence';
import { useNow } from '@/shared/lib/useNow';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Banner, EmptyState, Skeleton } from '@/shared/ui/feedback';
import { Segmented, SelectField, TextField } from '@/shared/ui/fields';
import { useState } from 'react';

function ProjectSkeletons() {
  return (
    <ul
      className="project-grid project-grid--grid"
      aria-label="Loading designs"
      aria-busy="true"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <li key={index} className="project-card project-card--grid">
          <Skeleton className="skeleton--thumb" />
          <div className="project-card__body">
            <Skeleton className="skeleton--line" />
            <Skeleton className="skeleton--line skeleton--short" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage({ search }: { search: string }) {
  const services = useServices();
  const { store } = useWorkspace();
  const notify = useNotify();
  const { preferences, update } = usePreferences();
  const now = useNow();
  const status = useWorkspaceState((state) => state.status);
  const loadError = useWorkspaceState((state) => state.loadError);
  const skipped = useWorkspaceState((state) => state.skipped);
  const documentsById = useWorkspaceState((state) => state.documents);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const query = parseQuery(new URLSearchParams(search));
  const documents = Object.values(documentsById);
  const visible = applyQuery(documents, query, now);
  const counts = countByCategory(documents);
  const view = preferences.projectView;

  const setQuery = (patch: Partial<ProjectQuery>) => {
    const params = serializeQuery({ ...query, ...patch }).toString();
    navigate(`/projects${params ? `?${params}` : ''}`, { replace: true });
  };

  const create = async (start: StartingPoint) => {
    const key = startingPointKey(start);
    setBusyKey(key);
    try {
      const document = createFromStartingPoint(start, {
        createId: services.createId,
        now: services.now(),
      });
      await store.getState().createDocument(document);
      // Ask the browser to keep this origin's data (from a user action, playbook 06).
      void requestPersistentStorage();
      setPickerOpen(false);
      navigate(`/studio/${document.id}`);
    } catch (error) {
      services.logger.error('dashboard.create_failed', { error });
      notify(
        'Couldn’t create the design. Check your browser storage and try again.',
        { tone: 'error' },
      );
    } finally {
      setBusyKey(null);
    }
  };

  const remove = async (document: DesignDocument) => {
    try {
      const removed = await store.getState().removeDocument(document.id);
      if (removed) {
        notify(`Deleted “${removed.name}”.`, {
          tone: 'info',
          action: {
            label: 'Undo',
            run: () => {
              void store.getState().restoreDocument(removed);
            },
          },
        });
      }
    } catch {
      notify(`Couldn’t delete “${document.name}”. It’s been restored.`, {
        tone: 'error',
      });
    }
  };

  const duplicate = async (document: DesignDocument) => {
    const timestamp = new Date(services.now()).toISOString();
    const copy: DesignDocument = {
      ...document,
      id: services.createId(),
      name: `${document.name} copy`.slice(0, 120),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await store.getState().createDocument(copy);
    notify(`Duplicated as “${copy.name}”.`, { tone: 'success' });
  };

  return (
    <div className="dashboard">
      <AppHeader>
        <TextField
          label="Search designs"
          hideLabel
          icon="search"
          type="search"
          placeholder="Search designs"
          value={query.search}
          className="app-header__search"
          onChange={(event) => {
            setQuery({ search: event.target.value });
          }}
        />
      </AppHeader>
      <div className="dashboard__body">
        <FilterSidebar query={query} counts={counts} onChange={setQuery} />
        <main className="dashboard__main" aria-labelledby="projects-title">
          <div className="dashboard__toolbar">
            <div>
              <h1 id="projects-title" className="dashboard__title">
                Projects
              </h1>
              <p className="dashboard__summary" aria-live="polite">
                {status === 'ready'
                  ? isFiltered(query)
                    ? `${visible.length} of ${documents.length} designs match your filters`
                    : `${documents.length} design${documents.length === 1 ? '' : 's'}`
                  : 'Loading your designs…'}
              </p>
            </div>
            <div className="dashboard__controls">
              <SelectField<SortOrder>
                label="Sort by"
                value={query.sort}
                options={SORT_ORDERS.map((order) => ({
                  value: order,
                  label: SORT_LABELS[order],
                }))}
                onChange={(sort) => {
                  setQuery({ sort });
                }}
              />
              <Segmented
                label="View"
                hideLabel
                value={view}
                onChange={(projectView) => {
                  update({ projectView });
                }}
                options={[
                  { value: 'grid', label: 'Grid view', icon: 'grid' },
                  { value: 'list', label: 'List view', icon: 'list' },
                ]}
              />
              <Button
                variant="primary"
                icon="plus"
                onClick={() => {
                  setPickerOpen(true);
                }}
              >
                New design
              </Button>
            </div>
          </div>

          {skipped > 0 && (
            <Banner tone="warning">
              {skipped} saved design{skipped === 1 ? '' : 's'} couldn’t be read
              and {skipped === 1 ? 'is' : 'are'} hidden.
            </Banner>
          )}

          {(status === 'idle' || status === 'loading') && <ProjectSkeletons />}

          {status === 'error' && (
            <EmptyState
              icon="alert"
              title="Your designs couldn’t be loaded"
              action={
                <Button
                  variant="primary"
                  icon="refresh"
                  onClick={() => {
                    void store.getState().load();
                  }}
                >
                  Try again
                </Button>
              }
            >
              {loadError}
            </EmptyState>
          )}

          {status === 'ready' && documents.length === 0 && (
            <section
              className="dashboard__empty"
              aria-labelledby="first-design"
            >
              <h2 id="first-design" className="dashboard__section-title">
                Create your first design
              </h2>
              <TemplatePicker
                busyKey={busyKey}
                onPick={(start) => {
                  void create(start);
                }}
              />
            </section>
          )}

          {status === 'ready' &&
            documents.length > 0 &&
            visible.length === 0 && (
              <EmptyState
                icon="search"
                title="No designs match"
                action={
                  <Button
                    onClick={() => {
                      setQuery({
                        search: '',
                        categories: [],
                        created: 'any',
                        edited: 'any',
                      });
                    }}
                  >
                    Clear filters
                  </Button>
                }
              >
                Try another search term, or widen the date and type filters.
              </EmptyState>
            )}

          {status === 'ready' && visible.length > 0 && (
            <ul className={`project-grid project-grid--${view}`}>
              {visible.map((document) => (
                <li key={document.id}>
                  <ProjectCard
                    document={document}
                    view={view}
                    now={now}
                    renaming={renamingId === document.id}
                    onStartRename={() => {
                      setRenamingId(document.id);
                    }}
                    onRename={(name) => {
                      setRenamingId(null);
                      if (name !== null) {
                        store.getState().renameDocument(document.id, name);
                      }
                    }}
                    onDuplicate={() => {
                      void duplicate(document);
                    }}
                    onDelete={() => {
                      void remove(document);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      <Dialog
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
        }}
        title="New design"
        description="Start from a blank canvas in any size, or from a professionally designed template."
        size="xl"
      >
        <TemplatePicker
          busyKey={busyKey}
          onPick={(start) => {
            void create(start);
          }}
        />
      </Dialog>
    </div>
  );
}
