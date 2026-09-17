export function passwordStrength(password: string) {
  const length = password.length;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  let score = length ? 1 : 0;
  if (length >= 8) score = 2;
  if (length >= 12 && classes >= 2) score = 3;
  if (length >= 16 && classes >= 3) score = 4;
  if (length >= 20 && classes >= 3) score = 5;
  if (/^(.)\1+$/.test(password) || /^(password|qwerty|123456|letmein)/i.test(password)) score = length ? 1 : 0;
  return { score, label: ['Enter a password', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][score], color: ['bg-slate-700', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-sky-400', 'bg-emerald-400'][score] };
}
