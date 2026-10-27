CREATE TABLE public.account_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 30),
  color text NOT NULL DEFAULT 'orange' CHECK (color IN ('orange','blue','green','pink','purple','yellow')),
  kids_max_age text CHECK (kids_max_age IN ('L','10','12')),
  pin_hash text,
  has_pin boolean GENERATED ALWAYS AS (pin_hash IS NOT NULL) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_profiles_user_idx ON public.account_profiles(user_id);
GRANT SELECT (id, user_id, name, color, kids_max_age, has_pin, created_at) ON public.account_profiles TO authenticated;
GRANT INSERT (user_id, name, color, kids_max_age), UPDATE (name, color, kids_max_age), DELETE ON public.account_profiles TO authenticated;
GRANT ALL ON public.account_profiles TO service_role;
ALTER TABLE public.account_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profiles read" ON public.account_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own profiles insert" ON public.account_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own profiles update" ON public.account_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own profiles delete" ON public.account_profiles FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Main profile is implicit (sentinel id); its optional PIN lives here.
CREATE TABLE public.main_profile_pins (
  user_id uuid PRIMARY KEY,
  pin_hash text NOT NULL
);
GRANT ALL ON public.main_profile_pins TO service_role;
ALTER TABLE public.main_profile_pins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.limit_account_profiles() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('account_profiles:' || NEW.user_id::text));
  IF (SELECT count(*) FROM public.account_profiles WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'Limite de 6 perfis por conta atingido.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_profiles_limit BEFORE INSERT ON public.account_profiles FOR EACH ROW EXECUTE FUNCTION public.limit_account_profiles();

ALTER TABLE public.reading_history ADD COLUMN profile_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.reading_history DROP CONSTRAINT reading_history_pkey;
ALTER TABLE public.reading_history ADD PRIMARY KEY (user_id, profile_id, series_id);
ALTER TABLE public.favorites ADD COLUMN profile_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.favorites DROP CONSTRAINT favorites_pkey;
ALTER TABLE public.favorites ADD PRIMARY KEY (user_id, profile_id, series_id);

CREATE OR REPLACE FUNCTION public.cleanup_account_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.reading_history WHERE user_id = OLD.user_id AND profile_id = OLD.id;
  DELETE FROM public.favorites WHERE user_id = OLD.user_id AND profile_id = OLD.id;
  RETURN OLD;
END $$;
CREATE TRIGGER account_profiles_cleanup AFTER DELETE ON public.account_profiles FOR EACH ROW EXECUTE FUNCTION public.cleanup_account_profile();

-- _profile NULL = main profile. _pin NULL clears.
CREATE OR REPLACE FUNCTION public.set_profile_pin(_profile uuid, _pin text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na conta.'; END IF;
  IF _pin IS NOT NULL AND _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'O PIN deve ter 4 números.'; END IF;
  IF _profile IS NULL THEN
    IF _pin IS NULL THEN DELETE FROM public.main_profile_pins WHERE user_id = auth.uid();
    ELSE INSERT INTO public.main_profile_pins(user_id, pin_hash) VALUES (auth.uid(), crypt(_pin, gen_salt('bf')))
      ON CONFLICT (user_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash; END IF;
  ELSE
    UPDATE public.account_profiles SET pin_hash = CASE WHEN _pin IS NULL THEN NULL ELSE crypt(_pin, gen_salt('bf')) END
      WHERE id = _profile AND user_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado.'; END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_profile_pin(_profile uuid, _pin text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE h text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF _profile IS NULL THEN SELECT pin_hash INTO h FROM public.main_profile_pins WHERE user_id = auth.uid();
  ELSE SELECT pin_hash INTO h FROM public.account_profiles WHERE id = _profile AND user_id = auth.uid(); END IF;
  IF h IS NULL THEN RETURN true; END IF;
  RETURN _pin IS NOT NULL AND crypt(_pin, h) = h;
END $$;

CREATE OR REPLACE FUNCTION public.main_profile_has_pin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.main_profile_pins WHERE user_id = auth.uid())
$$;

REVOKE ALL ON FUNCTION public.set_profile_pin(uuid, text), public.verify_profile_pin(uuid, text), public.main_profile_has_pin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_profile_pin(uuid, text), public.verify_profile_pin(uuid, text), public.main_profile_has_pin() TO authenticated;
REVOKE ALL ON FUNCTION public.limit_account_profiles(), public.cleanup_account_profile() FROM PUBLIC, anon, authenticated;