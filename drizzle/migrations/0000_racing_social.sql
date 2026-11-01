CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_lower ON public.profiles (lower(username));
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in racers can see usernames" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Racers update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND username ~ '^[A-Za-z0-9_]{3,20}$');

CREATE OR REPLACE FUNCTION public.handle_new_racer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; candidate text; n int := 0;
BEGIN
  base := regexp_replace(coalesce(NEW.raw_user_meta_data->>'username', split_part(coalesce(NEW.email, ''), '@', 1), 'racer'), '[^A-Za-z0-9_]', '', 'g');
  IF length(base) < 3 THEN base := 'racer' || base; END IF;
  base := left(base, 16);
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(candidate)) LOOP
    n := n + 1; candidate := base || (floor(random() * 9000) + 1000)::int::text;
    EXIT WHEN n > 20;
  END LOOP;
  INSERT INTO public.profiles (id, username) VALUES (NEW.id, candidate);
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_racer AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_racer();

CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester uuid NOT NULL,
  addressee uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester <> addressee)
);
CREATE UNIQUE INDEX friendships_pair ON public.friendships (least(requester, addressee), greatest(requester, addressee));
GRANT SELECT, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "See own friendships" ON public.friendships FOR SELECT TO authenticated USING (auth.uid() IN (requester, addressee));
CREATE POLICY "Remove own friendships" ON public.friendships FOR DELETE TO authenticated USING (auth.uid() IN (requester, addressee));

CREATE TABLE public.races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host uuid NOT NULL,
  guest uuid NOT NULL,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','declined','finished','cancelled')),
  host_engine text NOT NULL,
  guest_engine text,
  host_et numeric,
  guest_et numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.races TO authenticated;
GRANT ALL ON public.races TO service_role;
ALTER TABLE public.races ENABLE ROW LEVEL SECURITY;
CREATE POLICY "See own races" ON public.races FOR SELECT TO authenticated USING (auth.uid() IN (host, guest));

CREATE TABLE public.ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  name text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.ideas TO anon;
GRANT SELECT, INSERT ON public.ideas TO authenticated;
GRANT ALL ON public.ideas TO service_role;
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can send an idea" ON public.ideas FOR INSERT TO anon, authenticated
  WITH CHECK (length(message) BETWEEN 3 AND 1000 AND coalesce(length(name), 0) <= 60 AND (user_id IS NULL OR user_id = auth.uid()));
CREATE POLICY "See own ideas" ON public.ideas FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.send_friend_request(p_username text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; existing public.friendships;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT id INTO target FROM public.profiles WHERE lower(username) = lower(trim(p_username));
  IF target IS NULL THEN RAISE EXCEPTION 'No racer with that username'; END IF;
  IF target = auth.uid() THEN RAISE EXCEPTION 'You cannot add yourself'; END IF;
  SELECT * INTO existing FROM public.friendships WHERE least(requester, addressee) = least(auth.uid(), target) AND greatest(requester, addressee) = greatest(auth.uid(), target);
  IF existing.id IS NOT NULL THEN
    IF existing.status = 'pending' AND existing.addressee = auth.uid() THEN
      UPDATE public.friendships SET status = 'accepted' WHERE id = existing.id; RETURN 'accepted';
    END IF;
    RETURN existing.status;
  END IF;
  INSERT INTO public.friendships (requester, addressee) VALUES (auth.uid(), target);
  RETURN 'sent';
END $$;

CREATE OR REPLACE FUNCTION public.accept_friend(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.friendships SET status = 'accepted' WHERE id = p_id AND addressee = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.challenge_friend(p_friend uuid, p_engine text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.friendships WHERE status = 'accepted'
    AND ((requester = auth.uid() AND addressee = p_friend) OR (addressee = auth.uid() AND requester = p_friend))) THEN
    RAISE EXCEPTION 'You can only race friends';
  END IF;
  UPDATE public.races SET status = 'cancelled' WHERE host = auth.uid() AND status IN ('invited','accepted');
  INSERT INTO public.races (host, guest, host_engine) VALUES (auth.uid(), p_friend, left(p_engine, 40)) RETURNING id INTO rid;
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.respond_race(p_id uuid, p_accept boolean, p_engine text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.races SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, guest_engine = left(p_engine, 40)
  WHERE id = p_id AND guest = auth.uid() AND status = 'invited';
$$;

CREATE OR REPLACE FUNCTION public.cancel_race(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.races SET status = 'cancelled' WHERE id = p_id AND auth.uid() IN (host, guest) AND status IN ('invited','accepted');
$$;

CREATE OR REPLACE FUNCTION public.submit_race_time(p_id uuid, p_et numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE et numeric := greatest(1, least(999, p_et));
BEGIN
  UPDATE public.races SET host_et = coalesce(host_et, et) WHERE id = p_id AND host = auth.uid() AND status = 'accepted';
  UPDATE public.races SET guest_et = coalesce(guest_et, et) WHERE id = p_id AND guest = auth.uid() AND status = 'accepted';
  UPDATE public.races SET status = 'finished' WHERE id = p_id AND host_et IS NOT NULL AND guest_et IS NOT NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.send_friend_request(text), public.accept_friend(uuid), public.challenge_friend(uuid, text), public.respond_race(uuid, boolean, text), public.cancel_race(uuid), public.submit_race_time(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text), public.accept_friend(uuid), public.challenge_friend(uuid, text), public.respond_race(uuid, boolean, text), public.cancel_race(uuid), public.submit_race_time(uuid, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_racer() FROM PUBLIC, anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.races;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;