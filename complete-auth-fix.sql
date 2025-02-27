-- =====================================================
-- SOLUCIÓN COMPLETA PARA PROBLEMAS DE AUTENTICACIÓN
-- =====================================================
-- Este script soluciona problemas comunes con la autenticación en Supabase:
-- 1. Elimina y recrea correctamente el usuario administrador
-- 2. Asegura que las tablas de autenticación estén correctamente configuradas
-- 3. Restablece las relaciones entre auth.users, auth.identities y public.profiles

-- *************** PASO 1: ELIMINACIÓN COMPLETA DE LOS DATOS DE ADMIN ***************
DO $$
DECLARE
  admin_email TEXT := 'codemaxon@gmail.com';
  admin_id UUID := '22a89acd-92a3-4ade-aaf6-3ca1c4eec523'; -- ID conocido del admin
BEGIN
  RAISE NOTICE '======== INICIANDO LIMPIEZA COMPLETA DE USUARIO ADMIN ========';

  -- Eliminar de profiles primero para no violar restricciones de clave externa
  RAISE NOTICE 'Eliminando registro de profiles...';
  DELETE FROM public.profiles WHERE email = admin_email OR id = admin_id;
  
  -- Eliminar identidades asociadas con este usuario
  RAISE NOTICE 'Eliminando identidades existentes...';
  DELETE FROM auth.identities WHERE user_id = admin_id OR provider_id = admin_email;
  
  -- Verificamos si existe alguna entrada en auth.users.refresh_tokens
  -- Este es un intento ya que las tablas internas de auth pueden variar
  BEGIN
    EXECUTE 'DELETE FROM auth.refresh_tokens WHERE user_id = $1' USING admin_id;
    RAISE NOTICE 'Tokens de refresco eliminados';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Nota: No fue posible eliminar tokens de refresco (probablemente no es necesario)';
  END;
  
  -- Finalmente eliminar el usuario de auth.users
  RAISE NOTICE 'Eliminando registro de auth.users...';
  DELETE FROM auth.users WHERE email = admin_email OR id = admin_id;
  
  RAISE NOTICE 'Limpieza completa terminada!';
END $$;

-- *************** PASO 2: CREAR NUEVO USUARIO ADMIN DESDE CERO ***************
DO $$
DECLARE
  admin_email TEXT := 'codemaxon@gmail.com';
  admin_password TEXT := 'admin123';
  admin_name TEXT := 'Admin User';
  admin_id UUID;
  instance_id UUID;
BEGIN
  RAISE NOTICE '======== CREANDO NUEVO USUARIO ADMIN ========';
  
  -- Generar un nuevo UUID para el admin
  admin_id := uuid_generate_v4();
  RAISE NOTICE 'Nuevo ID de admin generado: %', admin_id;
  
  -- Obtener el instance_id
  SELECT id INTO instance_id FROM auth.instances LIMIT 1;
  RAISE NOTICE 'Instance ID: %', instance_id;
  
  -- 1. Crear el usuario en auth.users
  RAISE NOTICE 'Creando usuario en auth.users...';
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    last_sign_in_at,
    banned_until,
    aud,
    role,
    is_super_admin
  )
  VALUES (
    admin_id,
    instance_id,
    admin_email,
    crypt(admin_password, gen_salt('bf')), -- Hash correcto de la contraseña
    now(), -- Cuenta confirmada
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'provider', 'email',
      'providers', ARRAY['email']
    ),
    jsonb_build_object(
      'name', admin_name,
      'full_name', admin_name
    ),
    now(),
    now(),
    now(),
    NULL, -- Sin baneo
    'authenticated',
    'authenticated',
    false
  );
  
  -- 2. Crear la identidad en auth.identities
  RAISE NOTICE 'Creando identidad en auth.identities...';
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    admin_id, -- Mismo ID que el usuario
    admin_id,
    jsonb_build_object(
      'sub', admin_id,
      'email', admin_email,
      'email_verified', true
    ),
    'email',
    admin_email, -- El provider_id debe ser el email para el proveedor email
    now(),
    now(),
    now()
  );
  
  -- 3. Crear el perfil en public.profiles
  RAISE NOTICE 'Creando perfil en public.profiles...';
  INSERT INTO public.profiles (
    id,
    name,
    email,
    is_admin,
    created_at,
    last_login
  )
  VALUES (
    admin_id,
    admin_name,
    admin_email,
    true, -- Es administrador
    now(),
    now()
  );
  
  RAISE NOTICE '======== CREACIÓN DE USUARIO ADMIN COMPLETADA ========';
  RAISE NOTICE 'ID: %', admin_id;
  RAISE NOTICE 'Email: %', admin_email;
  RAISE NOTICE 'Password: %', admin_password;
END $$;

-- *************** PASO 3: VERIFICACIÓN FINAL ***************
DO $$
DECLARE
  admin_email TEXT := 'codemaxon@gmail.com';
  admin_id UUID;
  has_user BOOLEAN;
  has_identity BOOLEAN;
  has_profile BOOLEAN;
BEGIN
  RAISE NOTICE '======== VERIFICACIÓN FINAL ========';
  
  -- Verificar usuario en auth.users
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE email = admin_email
  ) INTO has_user;
  
  IF has_user THEN
    SELECT id INTO admin_id FROM auth.users WHERE email = admin_email;
    RAISE NOTICE 'Usuario en auth.users: CORRECTO (ID: %)', admin_id;
    
    -- Verificar identidad en auth.identities
    SELECT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = admin_id
    ) INTO has_identity;
    
    IF has_identity THEN
      RAISE NOTICE 'Identidad en auth.identities: CORRECTO';
    ELSE
      RAISE NOTICE 'Identidad en auth.identities: FALTANTE';
    END IF;
    
    -- Verificar perfil en public.profiles
    SELECT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = admin_id
    ) INTO has_profile;
    
    IF has_profile THEN
      RAISE NOTICE 'Perfil en public.profiles: CORRECTO';
    ELSE
      RAISE NOTICE 'Perfil en public.profiles: FALTANTE';
    END IF;
    
  ELSE
    RAISE NOTICE 'Usuario en auth.users: FALTANTE';
  END IF;
  
  RAISE NOTICE '====================================';
  RAISE NOTICE 'PROCESO COMPLETADO';
  RAISE NOTICE 'Por favor, intenta iniciar sesión con:';
  RAISE NOTICE 'Email: codemaxon@gmail.com';
  RAISE NOTICE 'Password: admin123';
END $$;