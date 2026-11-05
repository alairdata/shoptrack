'use client';
import {useEffect, useId, useRef, useState, type FormEvent, type ReactNode} from 'react';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {AlertTriangle, CircleAlert, CircleCheck, ClipboardList, Eye, EyeOff, LayoutDashboard, LogOut, Minus, Package, PackagePlus, Pencil, Percent, Plus, Receipt, Search, Settings, ShoppingCart, Trash2, X} from 'lucide-react';

type Item = {id: string; name: string; category: string; quantity: number; cost: number; price: number; archived?: boolean};
type Sale = {id: string; item_id: string; item_name: string; quantity: number; unit_cost: number; unit_price: number; list_price?: number | null; created_at: string};
type Expense = {id: string; purpose: string; amount: number; created_at: string};
type ItemValues = Omit<Item, 'id'>;
type Tab = 'Dashboard' | 'Add new' | 'Inventory' | 'Sell' | 'Sold items' | 'Expenses' | 'Admin';
type Notice = {text: string; error: boolean};
type ConfirmRequest = {title: string; body: ReactNode; actionLabel: string; danger?: boolean; run: () => Promise<void>};

const categories = ['Dresses', 'Jackets', 'Shoes', 'Shorts', 'Tops', 'Anklets', 'Bandanas', 'Socks'];
const LOW_STOCK = 3;
const tabs = [
  {name: 'Dashboard', short: 'Home', icon: LayoutDashboard, intro: 'How your shop is doing today.'},
  {name: 'Add new', short: 'Add new', icon: PackagePlus, intro: 'Find the item that came in, set how many, then tap Add. The cost adds up as you go.'},
  {name: 'Sell', short: 'Sell', icon: ShoppingCart, intro: 'Choose an item and record the sale. Stock and profit update automatically.'},
  {name: 'Sold items', short: 'Sold', icon: ClipboardList, intro: 'A record of everything you have sold, newest first.'},
  {name: 'Expenses', short: 'Expenses', icon: Receipt, intro: 'Transport, packaging, rent and other shop costs. Stock purchases belong under Inventory.'},
  {name: 'Inventory', short: 'Inventory', icon: Package, intro: 'Add and update what you have in stock.'},
  {name: 'Admin', short: 'Admin', icon: Settings, intro: 'Add, rename or remove your item groups, like Dresses or Shoes.'},
] as const;

const money = (n: number) =>
  (n < 0 ? '-' : '') + 'GH₵ ' + Math.abs(n).toLocaleString('en-GH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
const dateTime = (iso: string) => new Date(iso).toLocaleString(undefined, {day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'});

const isDiscounted = (s: Sale) => s.list_price != null && Number(s.unit_price) < Number(s.list_price);
const discountEach = (s: Sale) => Number(s.list_price) - Number(s.unit_price);

const config = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const db: SupabaseClient | null = config ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!) : null;

function Modal({title, onClose, children}: {title: string; onClose: () => void; children: ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    opener.current ??= document.activeElement as HTMLElement | null;
    if (ref.current && !ref.current.open) ref.current.showModal();
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => opener.current?.focus();
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId} onClose={onClose}>
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

function FormError({text}: {text: string}) {
  if (!text) return null;
  return (
    <p className="form-error wide" role="alert">
      <CircleAlert size={18} aria-hidden="true" />
      {text}
    </p>
  );
}

function StockCount({quantity}: {quantity: number}) {
  if (quantity === 0) return <span className="badge badge-out">Out of stock</span>;
  if (quantity <= LOW_STOCK) return <span className="badge badge-low">{quantity} left</span>;
  return <>{quantity}</>;
}

function ItemForm(props: {
  item: Item | null;
  categoryOptions: string[];
  defaultCategory: string;
  busy: boolean;
  error: string;
  onSubmit: (values: ItemValues) => void;
  onCancel: () => void;
}) {
  const {item, categoryOptions, defaultCategory, busy, error, onSubmit, onCancel} = props;
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? defaultCategory);
  const [newCategory, setNewCategory] = useState('');
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : '1');
  const [cost, setCost] = useState(item ? String(item.cost) : '');
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const profit = (Number(price) || 0) - (Number(cost) || 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      category: category === '__new__' ? newCategory.trim() : category,
      quantity: Number(quantity),
      cost: Number(cost),
      price: Number(price),
    });
  }

  return (
    <form className="formgrid" onSubmit={submit}>
      {item && <p className="muted wide">Changes affect future sales. Past sales stay the same.</p>}
      <label className="field wide">
        Item name
        <input required maxLength={100} placeholder="e.g. Floral summer dress" value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label className="field wide">
        Category
        <select value={category} onChange={e => setCategory(e.target.value)}>
          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="__new__">+ Add new category</option>
        </select>
      </label>
      {category === '__new__' && (
        <label className="field wide">
          New category name
          <input required maxLength={60} placeholder="e.g. Hats" value={newCategory} onChange={e => setNewCategory(e.target.value)} />
        </label>
      )}
      <label className="field wide">
        {item ? 'Quantity left' : 'Quantity'}
        <input type="number" inputMode="numeric" min={item ? 0 : 1} step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} />
      </label>
      <label className="field">
        Buying price (GH₵)
        <input type="number" inputMode="decimal" min="0" step="0.01" required value={cost} onChange={e => setCost(e.target.value)} />
      </label>
      <label className="field">
        Selling price (GH₵)
        <input type="number" inputMode="decimal" min="0" step="0.01" required value={price} onChange={e => setPrice(e.target.value)} />
      </label>
      <p className="form-note wide">
        Profit on each one sold: <b>{money(profit)}</b>
        {profit < 0 && <span className="form-note-warning">The selling price is lower than the buying price.</span>}
      </p>
      <FormError text={error} />
      <div className="modal-actions wide">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : item ? 'Save changes' : 'Add to stock'}</button>
      </div>
    </form>
  );
}

function ExpenseForm({busy, error, onSubmit, onCancel}: {busy: boolean; error: string; onSubmit: (purpose: string, amount: number) => void; onCancel: () => void}) {
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  return (
    <form className="formgrid" onSubmit={e => { e.preventDefault(); onSubmit(purpose.trim(), Number(amount)); }}>
      <label className="field wide">
        What was the money used for?
        <input required maxLength={200} placeholder="e.g. Delivery transport" value={purpose} onChange={e => setPurpose(e.target.value)} />
      </label>
      <label className="field wide">
        Amount (GH₵)
        <input type="number" inputMode="decimal" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} />
      </label>
      <FormError text={error} />
      <div className="modal-actions wide">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button>
      </div>
    </form>
  );
}

function SaleForm({item, qty, discount, busy, error, onSubmit, onCancel}: {item: Item; qty: number; discount: boolean; busy: boolean; error: string; onSubmit: (price: number) => void; onCancel: () => void}) {
  const [amount, setAmount] = useState('');
  const n = discount ? Number(amount) : item.price;
  const entered = !discount || amount.trim() !== '';
  const number = entered && Number.isFinite(n) && n >= 0;
  const tooHigh = discount && number && n >= item.price;
  const valid = number && !tooHigh;
  const off = valid ? item.price - n : 0;
  return (
    <form className="formgrid" onSubmit={e => { e.preventDefault(); if (valid) onSubmit(Math.round(n * 100) / 100); }}>
      <p className="wide">{qty} × <b>{item.name}</b></p>
      {discount && (
        <label className="field wide">
          {qty === 1 ? 'How much did you sell it for? (GH₵)' : 'How much did you sell each one for? (GH₵)'}
          <input data-autofocus type="number" inputMode="decimal" min="0" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} />
          <small className="field-hint">The full price is {money(item.price)}.</small>
        </label>
      )}
      {tooHigh && <p className="field-error wide" role="alert">That is the full price or more. Use Mark sold instead.</p>}
      <div className="form-note wide" role="status">
        Total: <b>{valid ? money(qty * n) : '–'}</b>
        {off > 0 && <span className="form-note-discount">Discount: {money(off)} each, {money(off * qty)} in total ({Math.round((off / item.price) * 100)}% off)</span>}
        {valid && n < item.cost && <span className="form-note-warning">This is below your buying price of {money(item.cost)}. You lose {money((item.cost - n) * qty)} on this sale.</span>}
      </div>
      <FormError text={error} />
      <div className="modal-actions wide">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !valid}>{busy ? 'Saving…' : 'Record sale'}</button>
      </div>
    </form>
  );
}

function DiscountMark({sale, onOpen}: {sale: Sale; onOpen: () => void}) {
  return (
    <button type="button" className="discount-mark" title="Sold at a discount" aria-label={`Sold at a discount: ${sale.item_name}. See details`} onClick={onOpen}>
      <Percent size={15} aria-hidden="true" />
    </button>
  );
}

function Stepper({itemName, value, max, onChange}: {itemName: string; value: string; max: number; onChange: (value: string) => void}) {
  const current = Number(value) || 0;
  const step = (next: number) => { if (next >= 1 && next <= max) onChange(String(next)); };
  return (
    <div className="stepper" role="group" aria-label={`Quantity of ${itemName}`}>
      <button type="button" aria-label="One less" aria-disabled={current <= 1} onClick={() => step(current - 1)}>
        <Minus size={18} aria-hidden="true" />
      </button>
      <input aria-label="Quantity" type="number" inputMode="numeric" min="1" max={max} step="1" value={value} onChange={e => onChange(e.target.value)} />
      <button type="button" aria-label="One more" aria-disabled={current >= max} onClick={() => step(current + 1)}>
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

function Toolbar({label, query, setQuery, filter, setFilter, options, shown, total, noun = 'item'}: {
  label: string; query: string; setQuery: (v: string) => void; filter: string; setFilter: (v: string) => void; options: string[]; shown: number; total: number; noun?: string;
}) {
  return (
    <div className="toolbar">
      <div className="search">
        <Search size={18} aria-hidden="true" />
        <input type="search" aria-label={label} placeholder="Search items" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      {options.length > 0 && (
        <select aria-label="Filter by category" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All categories</option>
          {options.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <p className="result-count" role="status">{shown === total ? `${total} ${total === 1 ? noun : `${noun}s`}` : `Showing ${shown} of ${total} ${noun}s`}</p>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function login(e: FormEvent) {
    e.preventDefault();
    if (!db) return;
    setBusy(true);
    setError('');
    const {error} = await db.auth.signInWithPassword({email, password});
    if (error) setError(error.message === 'Invalid login credentials' ? 'That email or password is not right. Check them and try again.' : error.message);
    setBusy(false);
  }

  return (
    <main className="center">
      <form className="auth" onSubmit={login}>
        <div className="brandmark" aria-hidden="true">▣</div>
        <div>
          <h1>Welcome to ShopTrack</h1>
          <p>Sign in to manage your shop</p>
        </div>
        <label className="field">
          Email
          <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password
          <span className="password-row">
            <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
            <button type="button" className="icon-btn" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </span>
        </label>
        <FormError text={error} />
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <small>Accounts are created by the shop owner in Supabase Auth.</small>
      </form>
    </main>
  );
}

export default function Home() {
  const [checkingSession, setCheckingSession] = useState(config);
  const [user, setUser] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('Dashboard');
  const [items, setItems] = useState<Item[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [itemModal, setItemModal] = useState<{item: Item | null} | null>(null);
  const [expenseModal, setExpenseModal] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const [selling, setSelling] = useState<{item: Item; qty: number; discount: boolean} | null>(null);
  const [discountSale, setDiscountSale] = useState<Sale | null>(null);
  const [discountOnly, setDiscountOnly] = useState(false);
  const [savedCategories, setSavedCategories] = useState<string[]>([]);
  const [adminName, setAdminName] = useState('');
  const [renaming, setRenaming] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [formError, setFormError] = useState('');
  const [lastCategory, setLastCategory] = useState('Dresses');
  const [sellQty, setSellQty] = useState<Record<string, string>>({});
  const [addQty, setAddQty] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const firstTabRender = useRef(true);
  const lastAdd = useRef({id: '', at: 0});

  const success = (text: string) => setNotice({text, error: false});
  const failure = (text: string) => setNotice({text, error: true});

  async function refresh() {
    if (!db) return;
    const [a, b, c, d] = await Promise.all([
      db.from('items').select('*').order('created_at', {ascending: false}),
      db.from('sales').select('*').order('created_at', {ascending: false}),
      db.from('expenses').select('*').order('created_at', {ascending: false}),
      db.from('shop_categories').select('name').order('name'),
    ]);
    setLoaded(true);
    if (a.error || b.error || c.error) {
      failure(a.error?.message || b.error?.message || c.error?.message || 'Your shop data could not be loaded. Check your connection and try again.');
      return;
    }
    setItems((a.data || []) as Item[]);
    setSales((b.data || []) as Sale[]);
    setExpenses((c.data || []) as Expense[]);
    if (!d.error) setSavedCategories((d.data || []).map(x => x.name as string));
  }

  useEffect(() => {
    if (!db) return;
    db.auth.getSession().then(({data}) => { setUser(!!data.session); setCheckingSession(false); });
    const {data: {subscription}} = db.auth.onAuthStateChange((_event, session) => setUser(!!session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) refresh();
    else { setItems([]); setSales([]); setExpenses([]); setSavedCategories([]); setLoaded(false); setTab('Dashboard'); setNotice(null); }
  }, [user]);

  // Move focus to the new page's title so screen readers announce the change.
  useEffect(() => {
    document.title = `${tab} · ShopTrack`;
    if (firstTabRender.current) { firstTabRender.current = false; return; }
    window.scrollTo(0, 0);
    heading.current?.focus();
  }, [tab]);

  // Success messages clear themselves. Errors stay until dismissed.
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  function goTo(next: Tab) {
    setTab(next);
    setNotice(null);
    setQuery('');
    setFilter('');
    setDiscountOnly(false);
  }

  function openItemModal(item: Item | null) {
    setFormError('');
    setItemModal({item});
  }

  async function saveItem(values: ItemValues) {
    if (!db || !itemModal) return;
    const editing = itemModal.item;
    if (!values.category) return setFormError('Enter a name for the new category.');
    if (!values.name) return setFormError('Enter the item name.');
    if (!Number.isInteger(values.quantity) || values.quantity < (editing ? 0 : 1)) return setFormError('Quantity must be a whole number.');
    if (!Number.isFinite(values.cost) || !Number.isFinite(values.price) || values.cost < 0 || values.price < 0) return setFormError('Prices must be zero or more.');
    setBusy(true);
    setFormError('');
    const {error} = editing
      ? await db.from('items').update(values).eq('id', editing.id)
      : await db.from('items').insert(values);
    if (error) setFormError(error.message);
    else {
      if (!savedCategories.includes(values.category)) await db.from('shop_categories').insert({name: values.category});
      setLastCategory(values.category);
      setItemModal(null);
      await refresh();
      success(editing ? `${values.name} updated` : `${values.name} added to stock`);
    }
    setBusy(false);
  }

  async function saveExpense(purpose: string, amount: number) {
    if (!db) return;
    if (!purpose) return setFormError('Say what the money was used for.');
    if (!Number.isFinite(amount) || amount <= 0) return setFormError('Amount must be more than zero.');
    setBusy(true);
    setFormError('');
    const {error} = await db.from('expenses').insert({purpose, amount});
    if (error) setFormError(error.message);
    else {
      setExpenseModal(false);
      await refresh();
      success('Expense saved');
    }
    setBusy(false);
  }

  async function addToStock(item: Item, qty: number) {
    if (!db || busy) return;
    // A quick double tap on the same item counts once.
    const now = Date.now();
    if (lastAdd.current.id === item.id && now - lastAdd.current.at < 1000) return;
    lastAdd.current = {id: item.id, at: now};
    setBusy(true);
    const next = item.quantity + qty;
    // Only saves if the count has not changed since this screen loaded, so a sale on another phone is never overwritten.
    const {data, error} = await db.from('items').update({quantity: next}).eq('id', item.id).eq('quantity', item.quantity).select('id');
    if (error) failure(error.message);
    else if (!data?.length) {
      await refresh();
      failure(`The count for ${item.name} just changed. Check the new count and tap Add again.`);
    } else {
      setAddQty(v => ({...v, [item.id]: '1'}));
      await refresh();
      success(`Added ${qty} × ${item.name} for ${money(qty * item.cost)}. Now ${next} in stock.`);
    }
    setBusy(false);
  }

  async function recordSale(price: number) {
    if (!db || !selling) return;
    const {item, qty} = selling;
    setBusy(true);
    setFormError('');
    const {error} = await db.rpc('record_sale', {p_item_id: item.id, p_quantity: qty, p_unit_price: price});
    if (error) setFormError(error.message);
    else {
      setSelling(null);
      setSellQty(v => ({...v, [item.id]: '1'}));
      await refresh();
      success(price < item.price ? `Sale recorded: ${qty} × ${item.name}, ${money((item.price - price) * qty)} off` : `Sale recorded: ${qty} × ${item.name}`);
    }
    setBusy(false);
  }

  function askToRemoveItem(item: Item) {
    setConfirming({
      title: 'Remove this item?',
      body: <p><b>{item.name}</b> will no longer appear in your shop or when selling. Past sales are kept.</p>,
      actionLabel: 'Remove item',
      danger: true,
      run: async () => {
        if (!db) return;
        const {data, error} = await db.from('items').update({archived: true}).eq('id', item.id).select('id');
        if (error) return failure(error.message);
        if (!data?.length) return failure('The item was not removed. Please check your access.');
        await refresh();
        success('Item removed from shop. Past sales are safe.');
      },
    });
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    const name = adminName.trim();
    if (!db || !name || busy) return;
    setBusy(true);
    const {error} = await db.from('shop_categories').insert({name});
    if (error) failure(error.code === '23505' ? `You already have a group called ${name}.` : error.message);
    else {
      setAdminName('');
      await refresh();
      success(`${name} group added`);
    }
    setBusy(false);
  }

  async function renameCategory(e: FormEvent) {
    e.preventDefault();
    const name = renameTo.trim();
    if (!db || !name || !renaming) return;
    setBusy(true);
    const {error} = await db.rpc('rename_shop_category', {p_old: renaming, p_new: name});
    if (error) failure(error.message);
    else {
      setRenaming('');
      await refresh();
      success('Group name changed');
    }
    setBusy(false);
  }

  function askToRemoveCategory(name: string) {
    setConfirming({
      title: 'Remove this group?',
      body: <p><b>{name}</b> will no longer be offered when adding items.</p>,
      actionLabel: 'Remove group',
      danger: true,
      run: async () => {
        if (!db) return;
        const {error} = await db.from('shop_categories').delete().eq('name', name);
        if (error) return failure(error.message);
        await refresh();
        success('Group removed');
      },
    });
  }

  function askToDeleteSale(sale: Sale) {
    setConfirming({
      title: 'Delete this sale?',
      body: <p>{sale.quantity} × <b>{sale.item_name}</b> for <b>{money(sale.quantity * sale.unit_price)}</b>. The {sale.quantity === 1 ? 'item goes' : 'items go'} back into stock and your totals update. This cannot be undone.</p>,
      actionLabel: 'Delete sale',
      danger: true,
      run: async () => {
        if (!db) return;
        const {error} = await db.rpc('delete_sale', {p_sale_id: sale.id});
        if (error) return failure(error.message);
        await refresh();
        success(`Sale deleted. ${sale.quantity} × ${sale.item_name} back in stock`);
      },
    });
  }

  function askToDeleteExpense(expense: Expense) {
    setConfirming({
      title: 'Delete this expense?',
      body: <p><b>{expense.purpose}</b>, {money(expense.amount)}. This cannot be undone.</p>,
      actionLabel: 'Delete expense',
      danger: true,
      run: async () => {
        if (!db) return;
        const {error} = await db.from('expenses').delete().eq('id', expense.id);
        if (error) return failure(error.message);
        await refresh();
        success('Expense deleted');
      },
    });
  }

  async function runConfirmed() {
    if (!confirming) return;
    setBusy(true);
    await confirming.run();
    setBusy(false);
    setConfirming(null);
  }

  if (!config) {
    return (
      <main className="center">
        <div className="auth">
          <h1>ShopTrack</h1>
          <p>Set Supabase environment variables to connect your database. See README.md.</p>
        </div>
      </main>
    );
  }
  if (checkingSession) return <main className="center"><p className="loading" role="status">Loading…</p></main>;
  if (!user) return <SignIn />;

  const activeItems = items.filter(i => !i.archived);
  const categoryOptions = Array.from(new Set([...savedCategories, ...activeItems.map(i => i.category), ...(savedCategories.length === 0 ? categories : [])])).sort((a, b) => a.localeCompare(b));
  const usedCategories = Array.from(new Set(activeItems.map(i => i.category))).sort((a, b) => a.localeCompare(b));
  const stockValue = activeItems.reduce((s, i) => s + i.quantity * i.cost, 0);
  const investment = stockValue + sales.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
  const revenue = sales.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const gross = sales.reduce((s, i) => s + i.quantity * (i.unit_price - i.unit_cost), 0);
  const expenseTotal = expenses.reduce((s, i) => s + Number(i.amount), 0);
  const net = gross - expenseTotal;
  const lowStock = activeItems.filter(i => i.quantity <= LOW_STOCK).sort((a, b) => a.quantity - b.quantity);
  const outOfStock = activeItems.filter(i => i.quantity === 0);

  const matches = (i: Item) =>
    (!filter || i.category === filter) &&
    (!query.trim() || `${i.name} ${i.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const shownItems = activeItems.filter(matches);
  const sellable = activeItems.filter(i => i.quantity > 0);
  const shownSellable = sellable.filter(matches);
  const categoryOf = new Map(items.map(i => [i.id, i.category]));
  const saleCategory = (s: Sale) => categoryOf.get(s.item_id) ?? '';
  const soldCategories = Array.from(new Set(sales.map(saleCategory).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const discountedSales = sales.filter(isDiscounted);
  const shownSales = sales.filter(s =>
    (!discountOnly || isDiscounted(s)) &&
    (!filter || saleCategory(s) === filter) &&
    (!query.trim() || `${s.item_name} ${saleCategory(s)}`.toLowerCase().includes(query.trim().toLowerCase())));
  const addableItems = [...activeItems].sort((a, b) => a.name.localeCompare(b.name));
  const shownAddable = addableItems.filter(i => !query.trim() || i.name.toLowerCase().includes(query.trim().toLowerCase()));
  const categorySales = Array.from(sales.reduce((m, s) => {
    const label = saleCategory(s) || 'Other / old items';
    return m.set(label, (m.get(label) || 0) + s.quantity);
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxCategorySales = Math.max(1, ...categorySales.map(c => c[1]));
  const current = tabs.find(t => t.name === tab)!;
  const noMatch = <p className="empty-block">No items match your search.</p>;

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to main content</a>
      <aside>
        <div className="logo">
          <span className="brandmark" aria-hidden="true">▣</span>
          <span>ShopTrack<small>Inventory &amp; POS</small></span>
        </div>
        <nav className="side-nav" aria-label="Main">
          {tabs.map(({name, icon: Icon}) => (
            <button key={name} type="button" aria-current={tab === name ? 'page' : undefined} onClick={() => goTo(name)}>
              <Icon size={19} aria-hidden="true" />
              {name}
            </button>
          ))}
        </nav>
        <button type="button" className="side-signout" onClick={() => db?.auth.signOut()}>
          <LogOut size={18} aria-hidden="true" /> Sign out
        </button>
      </aside>

      <main className="content" id="main" tabIndex={-1}>
        <div className="topbar">
          <span className="topbar-brand"><span className="brandmark" aria-hidden="true">▣</span> ShopTrack</span>
          <span className="topbar-actions">
            <button type="button" className="icon-btn" aria-label="Admin" aria-current={tab === 'Admin' ? 'page' : undefined} onClick={() => goTo('Admin')}>
              <Settings size={19} aria-hidden="true" />
            </button>
            <button type="button" className="topbar-signout" onClick={() => db?.auth.signOut()}>
              <LogOut size={18} aria-hidden="true" /> Sign out
            </button>
          </span>
        </div>

        <div className="page-head">
          <div>
            <h1 ref={heading} tabIndex={-1}>{tab}</h1>
            <p>{current.intro}</p>
          </div>
          {tab === 'Inventory' && (
            <button type="button" className="btn btn-primary" onClick={() => openItemModal(null)}>
              <Plus size={18} aria-hidden="true" /> Add stock
            </button>
          )}
          {tab === 'Expenses' && (
            <button type="button" className="btn btn-primary" onClick={() => { setFormError(''); setExpenseModal(true); }}>
              <Plus size={18} aria-hidden="true" /> Add expense
            </button>
          )}
        </div>

        {!loaded && <p className="loading" role="status">Loading your shop…</p>}

        {loaded && tab === 'Dashboard' && (
          <>
            <section className="hero" aria-label="Money spent on stock">
              <div>
                <span className="hero-label">Spent on stock</span>
                <strong className="hero-value">{money(investment)}</strong>
                <span className="hero-note">Buying cost of all the stock you have added.</span>
              </div>
            </section>

            <section className="stats" aria-label="Shop totals">
              <div className="stat"><span className="stat-label">Total sales</span><strong className="stat-value">{money(revenue)}</strong><span className="stat-note">Money from items sold</span></div>
              <div className="stat"><span className="stat-label">Profit from sales</span><strong className="stat-value">{money(gross)}</strong><span className="stat-note">Sales minus buying cost</span></div>
              <div className="stat"><span className="stat-label">Shop expenses</span><strong className="stat-value">{money(expenseTotal)}</strong><span className="stat-note">Transport, rent and so on</span></div>
              <div className="stat"><span className="stat-label">Profit after expenses</span><strong className="stat-value">{money(net)}</strong><span className="stat-note">{net < 0 ? 'Expenses are higher than sales profit so far' : 'Profit from sales minus expenses'}</span></div>
            </section>

            {outOfStock.length > 0 && (
              <section className="stock-alert" aria-label="Finished items">
                <AlertTriangle size={21} aria-hidden="true" />
                <div>
                  <b>{outOfStock.length} {outOfStock.length === 1 ? 'item is' : 'items are'} finished</b>
                  <p>{outOfStock.slice(0, 4).map(i => i.name).join(', ')}{outOfStock.length > 4 ? ' and more' : ''}</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => goTo('Add new')}>Add stock</button>
              </section>
            )}

            <div className="two">
              <section className="panel">
                <h2>Recent sales</h2>
                {sales.length === 0 ? <p className="empty">No sales recorded yet.</p> : (
                  <ul className="rows">
                    {sales.slice(0, 5).map(s => (
                      <li key={s.id}>
                        <span className="row-main">{s.item_name} × {s.quantity}<small>{shortDate(s.created_at)}</small></span>
                        <span className="row-end">{money(s.quantity * s.unit_price)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {sales.length > 5 && <button type="button" className="link-btn" onClick={() => goTo('Sold items')}>See all {sales.length} in Sold items</button>}
              </section>
              <section className="panel">
                <h2>Running low</h2>
                {lowStock.length === 0 ? <p className="empty">Nothing is running low.</p> : (
                  <>
                    <ul className="rows">
                      {lowStock.slice(0, 5).map(i => (
                        <li key={i.id}>
                          <span className="row-main">{i.name}<small>{i.category}</small></span>
                          <StockCount quantity={i.quantity} />
                        </li>
                      ))}
                    </ul>
                    {lowStock.length > 5 && <button type="button" className="link-btn" onClick={() => goTo('Inventory')}>See all {lowStock.length} in Inventory</button>}
                  </>
                )}
              </section>
            </div>

            <section className="panel chart-panel">
              <h2>Top 10 best-selling groups</h2>
              <p className="muted">Number of pieces sold, not money made.</p>
              {categorySales.length === 0 ? <p className="empty">Your chart will appear after you record sales.</p> : (
                <ol className="chart">
                  {categorySales.map(([name, count]) => (
                    <li key={name}>
                      <span className="chart-name">{name}</span>
                      <span className="chart-track" aria-hidden="true"><span style={{width: `${(100 * count) / maxCategorySales}%`}} /></span>
                      <b>{count}</b>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}

        {loaded && tab === 'Add new' && (
          activeItems.length === 0 ? (
            <section className="panel empty-block">
              <p>You have no items yet. Add your first one to get started.</p>
              <button type="button" className="btn btn-primary" onClick={() => openItemModal(null)}><Plus size={18} aria-hidden="true" /> Add a new item</button>
            </section>
          ) : (
            <>
              <Toolbar label="Search items" query={query} setQuery={setQuery} filter="" setFilter={setFilter} options={[]} shown={shownAddable.length} total={activeItems.length} />
              <section className="stats stats-two" aria-label="Stock totals">
                <div className="stat"><span className="stat-label">Units in stock</span><strong className="stat-value">{activeItems.reduce((n, i) => n + i.quantity, 0)}</strong></div>
                <div className="stat"><span className="stat-label">Spent on stock</span><strong className="stat-value">{money(investment)}</strong></div>
              </section>
              {shownAddable.length === 0 ? noMatch : (
                <ul className="stock-cards restock-cards" aria-label="Items you can add to">
                  {shownAddable.map(i => {
                    const value = addQty[i.id] ?? '1';
                    const qty = Number(value);
                    const valid = value.trim() !== '' && Number.isInteger(qty) && qty >= 1 && qty <= 9999;
                    return (
                      <li className="stock-card" key={i.id}>
                        <div className="stock-card-head">
                          <span className="stock-card-name">{i.name}</span>
                          <span className="sold-qty">{i.quantity > LOW_STOCK ? `${i.quantity} in stock` : <StockCount quantity={i.quantity} />}</span>
                        </div>
                        <dl>
                          <div><dt>Cost each</dt><dd>{money(i.cost)}</dd></div>
                          <div><dt>Total cost</dt><dd>{valid ? money(qty * i.cost) : '–'}</dd></div>
                        </dl>
                        <div className="restock-controls">
                          <Stepper itemName={i.name} value={value} max={9999} onChange={v => setAddQty(s => ({...s, [i.id]: v}))} />
                          <button type="button" className="btn btn-primary" aria-label={`Add to ${i.name}`} disabled={!valid} onClick={() => addToStock(i, qty)}>
                            <Plus size={18} aria-hidden="true" /> Add
                          </button>
                        </div>
                        {!valid && <p className="field-error" role="alert">Enter a whole number from 1 to 9999.</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <button type="button" className="link-btn restock-new" onClick={() => openItemModal(null)}>Item not on the list? Add a new item</button>
            </>
          )
        )}

        {loaded && tab === 'Inventory' && (
          activeItems.length === 0 ? (
            <section className="panel empty-block">
              <p>You have no stock yet. Add your first item to get started.</p>
              <button type="button" className="btn btn-primary" onClick={() => openItemModal(null)}><Plus size={18} aria-hidden="true" /> Add stock</button>
            </section>
          ) : (
            <>
              <Toolbar label="Search inventory" query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} options={usedCategories} shown={shownItems.length} total={activeItems.length} />
              {shownItems.length === 0 ? noMatch : (
                <>
                  <section className="panel stock-table" aria-label="All inventory">
                    <div className="tablewrap" tabIndex={0} role="region" aria-label="Inventory table">
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Item</th>
                            <th scope="col">Category</th>
                            <th scope="col">In stock</th>
                            <th scope="col">Buying price</th>
                            <th scope="col">Selling price</th>
                            <th scope="col">Profit each</th>
                            <th scope="col"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {shownItems.map(i => (
                            <tr key={i.id}>
                              <td className="name">{i.name}</td>
                              <td>{i.category}</td>
                              <td><StockCount quantity={i.quantity} /></td>
                              <td>{money(i.cost)}</td>
                              <td>{money(i.price)}</td>
                              <td>{money(i.price - i.cost)}</td>
                              <td>
                                <button type="button" className="btn btn-secondary" aria-label={`Edit ${i.name}`} onClick={() => openItemModal(i)}>
                                  <Pencil size={16} aria-hidden="true" /> Edit
                                </button>
                                <button type="button" className="icon-btn" aria-label={`Remove ${i.name}`} title={`Remove ${i.name}`} onClick={() => askToRemoveItem(i)}>
                                  <Trash2 size={17} aria-hidden="true" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <ul className="stock-cards" aria-label="All inventory">
                    {shownItems.map(i => (
                      <li className="stock-card" key={i.id}>
                        <div className="stock-card-head">
                          <span className="stock-card-name">{i.name}<small>{i.category}</small></span>
                          <span>{i.quantity > LOW_STOCK ? `${i.quantity} in stock` : <StockCount quantity={i.quantity} />}</span>
                        </div>
                        <dl>
                          <div><dt>Buying</dt><dd>{money(i.cost)}</dd></div>
                          <div><dt>Selling</dt><dd>{money(i.price)}</dd></div>
                          <div><dt>Profit each</dt><dd>{money(i.price - i.cost)}</dd></div>
                        </dl>
                        <button type="button" className="btn btn-secondary" aria-label={`Edit ${i.name}`} onClick={() => openItemModal(i)}>
                          <Pencil size={16} aria-hidden="true" /> Edit
                        </button>
                        <button type="button" className="btn btn-secondary" aria-label={`Remove ${i.name}`} onClick={() => askToRemoveItem(i)}>
                          <Trash2 size={16} aria-hidden="true" /> Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )
        )}

        {loaded && tab === 'Sell' && (
          sellable.length === 0 ? (
            <section className="panel empty-block">
              <p>No items in stock to sell. Add stock first.</p>
              <button type="button" className="btn btn-primary" onClick={() => { goTo('Inventory'); openItemModal(null); }}><Plus size={18} aria-hidden="true" /> Add stock</button>
            </section>
          ) : (
            <>
              <Toolbar label="Search items to sell" query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} options={Array.from(new Set(sellable.map(i => i.category))).sort((a, b) => a.localeCompare(b))} shown={shownSellable.length} total={sellable.length} />
              {shownSellable.length === 0 ? noMatch : (
                <div className="productgrid">
                  {shownSellable.map(i => {
                    const value = sellQty[i.id] ?? '1';
                    const qty = Number(value);
                    const valid = Number.isInteger(qty) && qty >= 1 && qty <= i.quantity;
                    return (
                      <article className="product" key={i.id}>
                        <div>
                          <span className="product-category">{i.category}</span>
                          <h2 className="product-name">{i.name}</h2>
                        </div>
                        <div>
                          <strong className="product-price">{money(i.price)}</strong>
                          <p className="product-meta">{i.quantity} available · {money(i.price - i.cost)} profit each</p>
                        </div>
                        <div className="product-foot">
                          <div className="qty-row">
                            <Stepper itemName={i.name} value={value} max={i.quantity} onChange={v => setSellQty(s => ({...s, [i.id]: v}))} />
                            <span className="qty-total">Total<b>{valid ? money(qty * i.price) : '–'}</b></span>
                          </div>
                          {!valid && <p className="field-error" role="alert">Enter a whole number from 1 to {i.quantity}.</p>}
                          <div className="sell-actions">
                            <button type="button" className="btn btn-primary" disabled={busy || !valid} onClick={() => { setFormError(''); setSelling({item: i, qty, discount: false}); }}>Mark sold</button>
                            <button type="button" className="btn btn-discount" aria-label={`Discount: sold ${i.name} for less`} disabled={busy || !valid || i.price <= 0} onClick={() => { setFormError(''); setSelling({item: i, qty, discount: true}); }}>
                              <Percent size={15} aria-hidden="true" /> Discount
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )
        )}

        {loaded && tab === 'Sold items' && (
          sales.length === 0 ? (
            <section className="panel empty-block">
              <p>Nothing sold yet. Items you sell will be listed here.</p>
              <button type="button" className="btn btn-primary" onClick={() => goTo('Sell')}><ShoppingCart size={18} aria-hidden="true" /> Record a sale</button>
            </section>
          ) : (
            <>
              <Toolbar label="Search sold items" query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} options={soldCategories} shown={shownSales.length} total={sales.length} noun="sale" />
              {discountedSales.length > 0 && (
                <div className="discount-bar">
                  <button type="button" className="chip" aria-pressed={discountOnly} onClick={() => setDiscountOnly(v => !v)}>
                    <Percent size={15} aria-hidden="true" /> Discounted only
                  </button>
                  <span>{discountedSales.length} {discountedSales.length === 1 ? 'sale' : 'sales'} · {money(discountedSales.reduce((n, s) => n + s.quantity * discountEach(s), 0))} given in discounts</span>
                </div>
              )}
              {shownSales.length === 0 ? <p className="empty-block">No sold items match your search.</p> : (
                <>
                  <section className="stats stats-sold" aria-label="Totals for the sales listed">
                    <div className="stat"><span className="stat-label">Units sold</span><strong className="stat-value">{shownSales.reduce((n, s) => n + s.quantity, 0)}</strong></div>
                    <div className="stat"><span className="stat-label">Total sales</span><strong className="stat-value">{money(shownSales.reduce((n, s) => n + s.quantity * s.unit_price, 0))}</strong></div>
                    <div className="stat"><span className="stat-label">Profit</span><strong className="stat-value">{money(shownSales.reduce((n, s) => n + s.quantity * (s.unit_price - s.unit_cost), 0))}</strong></div>
                  </section>
                  <section className="panel stock-table" aria-label="All sold items">
                    <div className="tablewrap" tabIndex={0} role="region" aria-label="Sold items table">
                      <table className="sold-table">
                        <thead>
                          <tr>
                            <th scope="col">Item</th>
                            <th scope="col">Category</th>
                            <th scope="col">Date sold</th>
                            <th scope="col">Quantity</th>
                            <th scope="col">Price each</th>
                            <th scope="col">Total</th>
                            <th scope="col">Profit</th>
                            <th scope="col"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {shownSales.map(s => (
                            <tr key={s.id}>
                              <td className="name"><span className="name-with-mark">{s.item_name}{isDiscounted(s) && <DiscountMark sale={s} onOpen={() => setDiscountSale(s)} />}</span></td>
                              <td>{saleCategory(s) || '–'}</td>
                              <td>{dateTime(s.created_at)}</td>
                              <td>{s.quantity}</td>
                              <td>{money(s.unit_price)}{isDiscounted(s) && <small className="was">was {money(Number(s.list_price))}</small>}</td>
                              <td>{money(s.quantity * s.unit_price)}</td>
                              <td>{money(s.quantity * (s.unit_price - s.unit_cost))}</td>
                              <td>
                                <button type="button" className="icon-btn" aria-label={`Delete sale: ${s.quantity} × ${s.item_name}, ${dateTime(s.created_at)}`} onClick={() => askToDeleteSale(s)}>
                                  <Trash2 size={17} aria-hidden="true" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <ul className="stock-cards" aria-label="All sold items">
                    {shownSales.map(s => (
                      <li className="stock-card" key={s.id}>
                        {isDiscounted(s) && <DiscountMark sale={s} onOpen={() => setDiscountSale(s)} />}
                        <div className={isDiscounted(s) ? 'stock-card-head has-mark' : 'stock-card-head'}>
                          <span className="stock-card-name">{s.item_name}<small>{dateTime(s.created_at)}</small></span>
                          <span className="sold-qty">{s.quantity} sold</span>
                        </div>
                        <dl>
                          <div><dt>Price each</dt><dd>{money(s.unit_price)}{isDiscounted(s) && <small className="was">was {money(Number(s.list_price))}</small>}</dd></div>
                          <div><dt>Total</dt><dd>{money(s.quantity * s.unit_price)}</dd></div>
                          <div><dt>Profit</dt><dd>{money(s.quantity * (s.unit_price - s.unit_cost))}</dd></div>
                        </dl>
                        <button type="button" className="btn btn-secondary" aria-label={`Delete sale: ${s.quantity} × ${s.item_name}, ${dateTime(s.created_at)}`} onClick={() => askToDeleteSale(s)}>
                          <Trash2 size={16} aria-hidden="true" /> Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )
        )}

        {loaded && tab === 'Admin' && (
          <>
            <section className="panel admin-add">
              <h2>Add a group</h2>
              <form className="admin-form" onSubmit={addCategory}>
                <label className="field">
                  New group name
                  <input required maxLength={60} placeholder="e.g. Handbags" value={adminName} onChange={e => setAdminName(e.target.value)} />
                </label>
                <button className="btn btn-primary" disabled={busy || !adminName.trim()}><Plus size={18} aria-hidden="true" /> Add group</button>
              </form>
            </section>
            <section className="panel">
              <h2>My groups</h2>
              <ul className="rows">
                {categoryOptions.map(c => {
                  const count = activeItems.filter(i => i.category === c).length;
                  return (
                    <li key={c}>
                      <span className="row-main">{c}<small>{count} {count === 1 ? 'item' : 'items'}</small></span>
                      <span className="row-end">
                        <button type="button" className="btn btn-secondary" aria-label={`Rename ${c}`} onClick={() => { setRenaming(c); setRenameTo(c); }}><Pencil size={16} aria-hidden="true" /> Rename</button>
                        <button type="button" className="icon-btn" aria-label={`Remove ${c}`} title={count > 0 ? 'Move its items to another group first' : `Remove ${c}`} aria-disabled={count > 0} onClick={() => { if (count > 0) failure(`${c} still has items. Move them to another group first.`); else askToRemoveCategory(c); }}>
                          <Trash2 size={17} aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        {loaded && tab === 'Expenses' && (
          <section className="panel">
            <h2>Expense history · {money(expenseTotal)}</h2>
            {expenses.length === 0 ? <p className="empty">No expenses recorded yet.</p> : (
              <ul className="rows">
                {expenses.map(e => (
                  <li key={e.id}>
                    <span className="row-main">{e.purpose}<small>{dateTime(e.created_at)}</small></span>
                    <span className="row-end">
                      {money(e.amount)}
                      <button type="button" className="icon-btn" aria-label={`Delete expense: ${e.purpose}`} onClick={() => askToDeleteExpense(e)}>
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      <nav className="bottomnav" aria-label="Main">
        {tabs.filter(t => t.name !== 'Admin').map(({name, short, icon: Icon}) => (
          <button key={name} type="button" aria-current={tab === name ? 'page' : undefined} onClick={() => goTo(name)}>
            <Icon size={20} aria-hidden="true" />
            {short}
          </button>
        ))}
      </nav>

      <div className="toast-region" aria-live="polite">
        {notice && (
          <div className={notice.error ? 'toast toast-error' : 'toast'}>
            {notice.error ? <CircleAlert size={18} aria-hidden="true" /> : <CircleCheck size={18} aria-hidden="true" />}
            <span>{notice.text}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss message" onClick={() => setNotice(null)}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {itemModal && (
        <Modal title={itemModal.item ? `Edit ${itemModal.item.name}` : 'Add new stock'} onClose={() => setItemModal(null)}>
          <ItemForm item={itemModal.item} categoryOptions={categoryOptions} defaultCategory={categoryOptions.includes(lastCategory) ? lastCategory : categoryOptions[0]} busy={busy} error={formError} onSubmit={saveItem} onCancel={() => setItemModal(null)} />
        </Modal>
      )}
      {expenseModal && (
        <Modal title="Add an expense" onClose={() => setExpenseModal(false)}>
          <ExpenseForm busy={busy} error={formError} onSubmit={saveExpense} onCancel={() => setExpenseModal(false)} />
        </Modal>
      )}
      {renaming && (
        <Modal title={`Rename ${renaming}`} onClose={() => setRenaming('')}>
          <form className="formgrid" onSubmit={renameCategory}>
            <label className="field wide">
              New name
              <input data-autofocus required maxLength={60} value={renameTo} onChange={e => setRenameTo(e.target.value)} />
            </label>
            <p className="muted wide">Items in this group move to the new name.</p>
            <div className="modal-actions wide">
              <button type="button" className="btn btn-secondary" onClick={() => setRenaming('')}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !renameTo.trim()}>{busy ? 'Saving…' : 'Save name'}</button>
            </div>
          </form>
        </Modal>
      )}
      {selling && (
        <Modal title={selling.discount ? 'Sold at a discount' : 'Record this sale?'} onClose={() => setSelling(null)}>
          <SaleForm item={selling.item} qty={selling.qty} discount={selling.discount} busy={busy} error={formError} onSubmit={recordSale} onCancel={() => setSelling(null)} />
        </Modal>
      )}
      {discountSale && (
        <Modal title="Sold at a discount" onClose={() => setDiscountSale(null)}>
          <p>{discountSale.quantity} × <b>{discountSale.item_name}</b>, {dateTime(discountSale.created_at)}</p>
          <ul className="rows">
            <li><span className="row-main">Listed price</span><span className="row-end">{money(Number(discountSale.list_price))}</span></li>
            <li><span className="row-main">Sold for</span><span className="row-end">{money(discountSale.unit_price)}</span></li>
            <li><span className="row-main">Discount each</span><span className="row-end">{money(discountEach(discountSale))} ({Math.round((discountEach(discountSale) / Number(discountSale.list_price)) * 100)}% off)</span></li>
            <li><span className="row-main">Total discount</span><span className="row-end">{money(discountSale.quantity * discountEach(discountSale))}</span></li>
            <li><span className="row-main">Profit on this sale</span><span className="row-end">{money(discountSale.quantity * (discountSale.unit_price - discountSale.unit_cost))}</span></li>
          </ul>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setDiscountSale(null)}>Close</button>
          </div>
        </Modal>
      )}
      {confirming && (
        <Modal title={confirming.title} onClose={() => setConfirming(null)}>
          {confirming.body}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(null)}>Cancel</button>
            <button type="button" className={confirming.danger ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy} onClick={runConfirmed}>
              {busy ? 'Saving…' : confirming.actionLabel}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
